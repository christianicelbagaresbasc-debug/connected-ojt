import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();
const catalog: [string, string][] = [
  ["JavaScript","Languages"],["TypeScript","Languages"],["Python","Languages"],["Java","Languages"],["C#","Languages"],["PHP","Languages"],["C++","Languages"],["C","Languages"],["Kotlin","Languages"],["Swift","Languages"],["HTML","Web"],["CSS","Web"],["React","Web"],["Next.js","Web"],["Node.js","Web"],["Express","Web"],["Vue","Web"],["Angular","Web"],["Laravel","Web"],["Django","Web"],["Flutter","Mobile"],["React Native","Mobile"],["Android","Mobile"],["iOS","Mobile"],["PostgreSQL","Databases"],["MySQL","Databases"],["SQLite","Databases"],["MongoDB","Databases"],["Redis","Databases"],["SQL","Databases"],["Networking","Networking"],["TCP/IP","Networking"],["DNS","Networking"],["Linux","Systems"],["Windows Server","Systems"],["Docker","Systems"],["Git","Tools"],["GitHub","Tools"],["CI/CD","Tools"],["AWS","Cloud"],["Azure","Cloud"],["Google Cloud","Cloud"],["Cybersecurity","Security"],["Information security","Security"],["Figma","Design"],["UI design","Design"],["UX research","Design"],["Adobe Photoshop","Multimedia"],["Adobe Premiere Pro","Multimedia"],["DaVinci Resolve","Multimedia"],["Canva","Multimedia"],["Data analysis","Data"],["Excel","Data"],["Power BI","Data"],["Machine learning","Data"],["Communication","Soft skills"],["Teamwork","Soft skills"],["Problem solving","Soft skills"],["Time management","Soft skills"],["Technical writing","Soft skills"]
];
async function main() {
  const email = process.env.SEED_COORDINATOR_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_COORDINATOR_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_COORDINATOR_EMAIL and SEED_COORDINATOR_PASSWORD before seeding.");
  for (const [name, category] of catalog) await db.skill.upsert({ where: { name }, update: { category }, create: { name, category } });
  const hash = await bcrypt.hash(password, 12);
  await db.user.upsert({ where: { email }, update: { name: "OJT Coordinator", role: "COORDINATOR", isActive: true }, create: { email, name: "OJT Coordinator", passwordHash: hash, role: "COORDINATOR", mustChangePassword: true } });
  if (process.env.SEED_DEMO !== "true") return;
  const demoPassword = process.env.SEED_DEMO_PASSWORD || randomBytes(10).toString("base64url");
  const demoHash = await bcrypt.hash(demoPassword, 12);
  const demoEmails = ["demo.coordinator@connected.test","demo.cocoordinator@connected.test","demo.student@connected.test","demo.company@connected.test","demo.attorney@connected.test"];
  const roles: Role[] = ["COORDINATOR","CO_COORDINATOR","STUDENT","COMPANY","ATTORNEY"];
  const demoUsers = [];
  for (let i = 0; i < demoEmails.length; i++) demoUsers.push(await db.user.upsert({ where: { email: demoEmails[i] }, update: { name: `Demo ${roles[i].replaceAll("_", " ")}`, role: roles[i], isActive: true }, create: { email: demoEmails[i], name: `Demo ${roles[i].replaceAll("_", " ")}`, passwordHash: demoHash, role: roles[i], mustChangePassword: true } }));
  const [coordinator, coCoordinator, studentUser, companyUser] = demoUsers;
  const studentData = [
    ["2020-00101","Ari Santos","APPROVED"],["2020-00102","Bea Cruz","APPROVED"],["2020-00103","Cal Reyes","PENDING"],["2020-00104","Dani Lim","APPROVED"],["2020-00105","Eli Ramos","APPROVED"]
  ] as const;
  const students = [];
  for (let i=0;i<studentData.length;i++) {
    const [number,name,approval]=studentData[i];
    const user=await db.user.upsert({ where:{email:`demo.student${i+1}@connected.test`}, update:{name,role:"STUDENT",isActive:true}, create:{email:`demo.student${i+1}@connected.test`,name,passwordHash:demoHash,role:"STUDENT"} });
    const profile=await db.studentProfile.upsert({where:{studentNumber:number},update:{approval,assignedToId:i===0?coCoordinator.id:null},create:{userId:user.id,studentNumber:number,approval,assignedToId:i===0?coCoordinator.id:null,headline:"BSIT student seeking an OJT placement"}});
    students.push(profile);
  }
  const companyData = [
    ["BasaTech Solutions","EXISTING_PARTNER","VERIFIED"],["Pinaod Digital Works","EXISTING_PARTNER","VERIFIED"],["Bulacan Data Lab","NEW_COMPANY","UNDER_REVIEW"],["San Ildefonso Systems","NEW_COMPANY","PENDING"]
  ] as const;
  const companies=[];
  for (let i=0;i<companyData.length;i++) { const [name,partnerType,verification]=companyData[i]; companies.push(await db.company.upsert({where:{id:`demo-company-${i+1}`},update:{name,partnerType,verification},create:{id:`demo-company-${i+1}`,name,industry:"Information Technology",partnerType,verification,contactEmail:`contact${i+1}@connected.test`,verifiedAt:verification==="VERIFIED"?new Date():null}})); }
  await db.user.update({where:{id:companyUser.id},data:{companyId:companies[0].id}});
  const skills=await db.skill.findMany({where:{name:{in:["JavaScript","TypeScript","SQL","Python","Communication"]}}});
  for (const [idx,company] of companies.entries()) {
    const opportunity=await db.opportunity.upsert({where:{id:`demo-opportunity-${idx+1}`},update:{title:`Junior IT Intern ${idx+1}`,companyId:company.id,status:idx<2?"OPEN":"CLOSED"},create:{id:`demo-opportunity-${idx+1}`,companyId:company.id,title:`Junior IT Intern ${idx+1}`,description:"Support the team with supervised web, database, and documentation work.",tasks:"Assist with implementation, testing, and documentation.",slots:2,workArrangement:"HYBRID",status:idx<2?"OPEN":"CLOSED"}});
    for(const skill of skills.slice(0,3)) await db.opportunitySkill.upsert({where:{opportunityId_skillId:{opportunityId:opportunity.id,skillId:skill.id}},update:{},create:{opportunityId:opportunity.id,skillId:skill.id}});
  }
  for (let i=0;i<Math.min(5,skills.length);i++) await db.studentSkill.upsert({where:{studentId_skillId:{studentId:students[0].id,skillId:skills[i].id}},update:{},create:{studentId:students[0].id,skillId:skills[i].id}});
  await db.application.upsert({where:{studentId_opportunityId:{studentId:students[0].id,opportunityId:"demo-opportunity-1"}},update:{},create:{studentId:students[0].id,opportunityId:"demo-opportunity-1",status:"UNDER_REVIEW",coverNote:"I am excited to learn from your team."}});
  await db.application.upsert({where:{studentId_opportunityId:{studentId:students[1].id,opportunityId:"demo-opportunity-2"}},update:{},create:{studentId:students[1].id,opportunityId:"demo-opportunity-2",status:"ACCEPTED",studentConfirmed:true}});
  await db.notification.upsert({where:{id:"demo-notification-welcome"},update:{},create:{id:"demo-notification-welcome",userId:studentUser.id,message:"Welcome to the ConnectEd demo.",href:"/student"}});
  console.log(`Demo password (use for all demo accounts): ${demoPassword}`);
  void coordinator;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Seed failed."); process.exitCode=1; }).finally(async()=>db.$disconnect());
