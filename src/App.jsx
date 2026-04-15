import { useState, useRef, useEffect } from "react";
import { FaUser, FaEnvelope, FaCheck, FaHeart, FaStar, FaFootballBall, FaPlane, FaMugHot, FaClipboard, FaHourglassHalf, FaTimes, FaCoffee, FaLaptop, FaFutbol, FaCamera, FaBook, FaBuilding, FaShoppingCart, FaPaw, FaSoap, FaUniversity, FaChartLine, FaPen, FaBasketballBall, FaDrumstickBite, FaHospital, FaShoppingBag, FaCar, FaFilm, FaLeaf, FaGraduationCap, FaExclamationTriangle, FaLock, FaDoorOpen, FaArrowLeft, FaHome, FaFileAlt, FaCalendar, FaUsers, FaBriefcase, FaMapMarker, FaQuestion, FaSearch, FaClock, FaStickyNote, FaLightbulb, FaMicrophone, FaTrophy, FaUpload, FaWrench, FaPalette, FaRegHeart } from "react-icons/fa";
import { supabase } from "./supabaseClient";

// ─────────────────────────────────────────────────────────────
// SUPABASE SETUP
// This creates the connection to Supabase using the bundled client.
// ─────────────────────────────────────────────────────────────
var sb = supabase;

// ─────────────────────────────────────────────────────────────
// SUPABASE HELPER FUNCTIONS
// These talk to your database. They fall back gracefully if
// Supabase is not connected yet.
// ─────────────────────────────────────────────────────────────

async function dbSignUp(email, password, role, extra) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.auth.signUp({ email: email, password: password });
  if (res.error) return { error: res.error.message };
  var uid = res.data.user.id;
  await sb.from("profiles").insert({ id: uid, role: role, email: email, first_name: extra.firstName || "", last_name: extra.lastName || "" });
  if (role === "student") {
    await sb.from("students").insert({ id: uid, school: extra.school || "", grade: extra.grade || "", skills: [] });
  } else {
    await sb.from("employers").insert({ id: uid, company_name: extra.company || "" });
  }
  return { uid: uid, role: role };
}

async function dbSignIn(email, password) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.auth.signInWithPassword({ email: email, password: password });
  if (res.error) return { error: res.error.message };
  var uid = res.data.user.id;
  var prof = await sb.from("profiles").select("role,first_name,last_name").eq("id", uid).maybeSingle();
  if (prof.error) return { error: prof.error.message };
  if (!prof.data) return { error: "Profile not found. Please contact support." };
  return { uid: uid, role: prof.data.role, name: prof.data.first_name + " " + prof.data.last_name };
}

async function dbLoadJobs() {
  if (!sb) return null;
  var res = await sb.from("jobs").select("*").eq("is_active", true).order("posted_at", { ascending: false });
  if (res.error) { console.error(res.error); return null; }
  return res.data;
}

async function dbLoadMyApps(studentId) {
  if (!sb) return null;
  var res = await sb.from("applications").select("*, jobs(*), interviews(*)").eq("student_id", studentId);
  if (res.error) return null;
  return res.data;
}

async function dbSubmitApp(jobId, studentId, availability, note, answers) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.from("applications").insert({ job_id: jobId, student_id: studentId, availability: availability, note: note, answers: answers, status: "pending" });
  return res.error ? { error: res.error.message } : { ok: true };
}

async function dbSaveJob(studentId, jobId) {
  if (!sb) return { error: "not_connected" };
  if (!studentId || !jobId) {
    return { error: "Invalid save payload: missing studentId or jobId" };
  }
  var res = await sb.from("saved_jobs").insert({ student_id: studentId, job_id: jobId });
  if (res.error) {
    console.error("dbSaveJob error", res.error, res);
    if (res.error.message && res.error.message.toLowerCase().includes("duplicate")) {
      return { ok: true };
    }
    var errMsg = res.error.message || res.error.details || res.error.hint || JSON.stringify(res.error);
    return { error: errMsg };
  }
  return { ok: true };
}

async function dbUnsaveJob(studentId, jobId) {
  if (!sb) return { error: "not_connected" };
  if (!studentId || !jobId) {
    return { error: "Invalid unsave payload: missing studentId or jobId" };
  }
  var res = await sb.from("saved_jobs").delete().eq("student_id", studentId).eq("job_id", jobId);
  if (res.error) {
    console.error("dbUnsaveJob error", res.error, res);
    var errMsg = res.error.message || res.error.details || res.error.hint || JSON.stringify(res.error);
    return { error: errMsg };
  }
  return { ok: true };
}

async function dbLoadSaved(studentId) {
  if (!sb) return null;
  if (!studentId) return [];
  var res = await sb.from("saved_jobs").select("job_id").eq("student_id", studentId);
  if (res.error) {
    console.error("dbLoadSaved error", res.error, res);
    return null;
  }
  return res.data.map(function(r) { return r.job_id; });
}

async function dbUpdateProfile(studentId, fields) {
  if (!sb) return;
  await sb.from("students").update(fields).eq("id", studentId);
}

async function dbSaveResumeData(studentId, resumeData) {
  if (!sb) return;
  await sb.from("students").update({
    first_name: resumeData.firstName,
    last_name: resumeData.lastName,
    email: resumeData.email,
    phone: resumeData.phone,
    school: resumeData.school,
    grade: resumeData.grade,
    gpa: resumeData.gpa,
    summary: resumeData.summary,
    skills: resumeData.skills,
    activities: resumeData.activities,
    experience: resumeData.experience,
    resume_url: resumeData.resumeUrl
  }).eq("id", studentId);
}

async function dbSaveProfile(studentId, profileData) {
  if (!sb) return { error: "not_connected" };
  const { error } = await sb.from("profiles").update({
    first_name: profileData.firstName,
    last_name: profileData.lastName
  }).eq("id", studentId);
  if (error) return { error: error.message };
  return {};
}

async function dbUploadResume(uid, file) {
  if (!sb) return { error: "not_connected" };
  const fileName = `${uid}/${file.name}`;
  const { error } = await sb.storage.from('resumes').upload(fileName, file);
  if (error) return { error: error.message };
  const { data: urlData } = sb.storage.from('resumes').getPublicUrl(fileName);
  return { url: urlData.publicUrl };
}

// Employer functions
async function dbLoadMyJobs(employerId) {
  if (!sb) return null;
  var res = await sb.from("jobs").select("*").eq("employer_id", employerId);
  return res.error ? null : res.data;
}

async function dbPostJob(employerId, job) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.from("jobs").insert(Object.assign({}, job, { employer_id: employerId, is_active: true }));
  return res.error ? { error: res.error.message } : { ok: true };
}

async function dbLoadApplicants(employerId) {
  if (!sb) return null;
  var res = await sb.from("applications").select("*, students(*), jobs(title)").in("job_id",
    (await sb.from("jobs").select("id").eq("employer_id", employerId)).data.map(function(j){return j.id;})
  );
  return res.error ? null : res.data;
}

async function dbUpdateAppStatus(appId, status) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.from("applications").update({ status: status }).eq("id", appId);
  return res.error ? { error: res.error.message } : { ok: true };
}

async function dbScheduleInterview(appId, ivData) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.from("interviews").upsert({ application_id: appId, interview_date: ivData.interview_date, interview_time: ivData.interview_time, location: ivData.location, notes: ivData.notes });
  return res.error ? { error: res.error.message } : { ok: true };
}

// ─────────────────────────────────────────────────────────────
// DISTANCE HELPER
// ─────────────────────────────────────────────────────────────
function calcMiles(la1, lo1, la2, lo2) {
  var R = 3959, x = (la2-la1)*Math.PI/180, y = (lo2-lo1)*Math.PI/180;
  var a = Math.sin(x/2)*Math.sin(x/2)+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(y/2)*Math.sin(y/2);
  return parseFloat((R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(1));
}

// ─────────────────────────────────────────────────────────────
// LOCAL FALLBACK DATA (used when Supabase is not connected yet)
// ─────────────────────────────────────────────────────────────
var AREAS = [
  {l:"Select area...",la:null,lo:null},
  {l:"Downtown Dallas",la:32.777,lo:-96.797},{l:"Uptown Dallas",la:32.793,lo:-96.807},
  {l:"Plano",la:33.02,lo:-96.699},{l:"Frisco",la:33.151,lo:-96.824},
  {l:"Richardson",la:32.948,lo:-96.73},{l:"Garland",la:32.913,lo:-96.639},
  {l:"Irving",la:32.814,lo:-96.949},{l:"Arlington",la:32.736,lo:-97.108},
  {l:"McKinney",la:33.197,lo:-96.64},{l:"Allen",la:33.103,lo:-96.671},
];

var LOCAL_JOBS = [
  {id:1,co:"Houndstooth Coffee",title:"Barista Trainee",type:"Part-Time",pay:"$13-15/hr",tags:["No Exp","16+"],logo:<FaCoffee />,clr:"#F59E0B",loc:"Uptown Dallas",la:32.793,lo:-96.807,sched:"Weekends + After School",train:"Full training",desc:"Learn specialty coffee from espresso to latte art. Fun team, great tips.",posted:"Today",spots:3,qs:["What days can you work?","Any customer service experience?"]},
  {id:28,co:"Houndstooth Coffee",title:"Shift Supervisor Trainee",type:"Part-Time",pay:"$15-17/hr",tags:["18+","Leadership"],logo:<FaCoffee />,clr:"#F59E0B",loc:"Deep Ellum",la:32.786,lo:-96.784,sched:"Weekday mornings",train:"Leadership mentorship",desc:"Lead a team and grow. We promote from within.",posted:"Today",spots:1,qs:["Describe a time you led a group.","Available mornings?"]},
  {id:29,co:"Houndstooth Coffee",title:"Pastry Counter Associate",type:"Part-Time",pay:"$12-14/hr",tags:["No Exp","16+"],logo:<FaCoffee />,clr:"#F59E0B",loc:"Park Cities",la:32.843,lo:-96.799,sched:"Mon-Sat 6am-11am",train:"Food handler cert",desc:"Assist with pastry display and customer orders.",posted:"2d ago",spots:2,qs:["Comfortable with early morning shifts?"]},
  {id:2,co:"AT&T",title:"Junior IT Intern",type:"Internship",pay:"$18/hr",tags:["College","Tech"],logo:<FaLaptop />,clr:"#3B82F6",loc:"Downtown Dallas",la:32.777,lo:-96.797,sched:"Mon-Fri 9am-3pm",train:"Full mentorship",desc:"Work on real infrastructure projects alongside engineers.",posted:"1d ago",spots:2,qs:["What programming languages do you know?"]},
  {id:3,co:"Dallas YMCA",title:"Youth Sports Coach",type:"Part-Time",pay:"$12/hr",tags:["No Exp","16+"],logo:<FaFutbol />,clr:"#10B981",loc:"Plano, TX",la:33.02,lo:-96.699,sched:"Saturdays 8am-2pm",train:"CPR cert provided",desc:"Lead youth basketball and soccer for kids 6-12.",posted:"3d ago",spots:5,qs:[]},
  {id:4,co:"Visit Dallas",title:"Social Media Intern",type:"Internship",pay:"$15/hr",tags:["Creative","College"],logo:<FaCamera />,clr:"#8B5CF6",loc:"Deep Ellum",la:32.786,lo:-96.784,sched:"Flexible 15 hrs/wk",train:"Creative mentorship",desc:"Create content showcasing Dallas culture and events.",posted:"Today",spots:1,qs:["Share a social account you admire and why."]},
  {id:5,co:"Dallas Public Library",title:"Library Page",type:"Part-Time",pay:"$11/hr",tags:["14+","No Exp"],logo:<FaBook />,clr:"#EF4444",loc:"Multiple Locations",la:32.801,lo:-96.797,sched:"After school + Sat",train:"On-the-job training",desc:"Help organize the collection and assist visitors.",posted:"4d ago",spots:8,qs:[]},
  {id:6,co:"Marriott Hotels",title:"Front Desk Associate",type:"Part-Time",pay:"$14/hr",tags:["18+","Hospitality"],logo:<FaBuilding />,clr:"#06B6D4",loc:"Las Colinas",la:32.866,lo:-96.955,sched:"Evenings and Weekends",train:"Paid orientation",desc:"Greet guests and manage check-ins.",posted:"2d ago",spots:4,qs:["How would you handle an upset guest?"]},
  {id:7,co:"Southwest Airlines",title:"Marketing Intern",type:"Internship",pay:"$20/hr",tags:["College","Marketing"],logo:<FaPlane />,clr:"#EF4444",loc:"Love Field",la:32.847,lo:-96.852,sched:"Mon-Fri full summer",train:"Corporate mentorship",desc:"Join the marketing team at one of America's most iconic airlines.",posted:"Today",spots:2,qs:["Describe a campaign you have worked on."]},
  {id:8,co:"Tom Thumb",title:"Grocery Stock Associate",type:"Part-Time",pay:"$12.50/hr",tags:["16+","No Exp"],logo:<FaShoppingCart />,clr:"#84CC16",loc:"Richardson, TX",la:32.948,lo:-96.73,sched:"Evenings 4-10pm",train:"Same-day training",desc:"Keep shelves stocked and the store organized.",posted:"1d ago",spots:10,qs:[]},
  {id:9,co:"VCA Animal Hospitals",title:"Pet Care Assistant",type:"Part-Time",pay:"$13/hr",tags:["16+","No Exp"],logo:<FaPaw />,clr:"#F97316",loc:"Frisco, TX",la:33.151,lo:-96.824,sched:"Weekends + 1 weekday",train:"Vet team mentorship",desc:"Help care for animals and assist veterinary staff.",posted:"Today",spots:2,qs:["Why do you want to work with animals?"]},
  {id:10,co:"H-E-B",title:"Cashier",type:"Part-Time",pay:"$12/hr",tags:["16+","No Exp"],logo:<FaSoap />,clr:"#E11D48",loc:"McKinney, TX",la:33.197,lo:-96.64,sched:"Flexible any shift",train:"Paid training week",desc:"Greet customers and process transactions.",posted:"1d ago",spots:12,qs:[]},
  {id:11,co:"Chase Bank",title:"Bank Teller Trainee",type:"Part-Time",pay:"$14/hr",tags:["18+","No Exp"],logo:<FaUniversity />,clr:"#1D4ED8",loc:"Irving, TX",la:32.814,lo:-96.949,sched:"Mon-Sat flexible",train:"2-week onboarding",desc:"Assist customers with transactions and account questions.",posted:"2d ago",spots:5,qs:[]},
  {id:12,co:"Deloitte Dallas",title:"Office Admin Intern",type:"Internship",pay:"$19/hr",tags:["College","Business"],logo:<FaChartLine />,clr:"#1E40AF",loc:"Uptown Dallas",la:32.793,lo:-96.807,sched:"Mon-Fri 9am-5pm",train:"Professional dev program",desc:"Support Deloitte's Dallas office. A prestigious resume builder.",posted:"1d ago",spots:3,qs:["Why are you interested in professional services?"]},
  {id:13,co:"AT&T Stadium",title:"Game Day Event Staff",type:"Seasonal",pay:"$13/hr",tags:["18+","Events","Sports"],logo:<FaFootballBall />,clr:"#003594",loc:"Arlington, TX",la:32.748,lo:-97.094,sched:"Game days and events",train:"Event orientation",desc:"Work Cowboys games and concerts at one of the world's most iconic stadiums.",posted:"3d ago",spots:30,qs:[]},
  {id:14,co:"Kumon Learning Center",title:"Tutoring Assistant",type:"Part-Time",pay:"$12/hr",tags:["16+","Academic"],logo:<FaPen />,clr:"#EC4899",loc:"Frisco and Plano",la:33.085,lo:-96.761,sched:"Mon-Thu 3-7pm",train:"Kumon method training",desc:"Help younger students with math and reading.",posted:"5d ago",spots:3,qs:[]},
  {id:15,co:"Dallas Mavericks",title:"Game Night Crew Member",type:"Seasonal",pay:"$13/hr",tags:["18+","Events","Sports"],logo:<FaBasketballBall />,clr:"#006BB6",loc:"Downtown Dallas",la:32.790,lo:-96.810,sched:"Home game nights",train:"Arena orientation",desc:"Work home games at American Airlines Center and create an amazing fan experience.",posted:"Today",spots:20,qs:[]},
  {id:16,co:"Chick-fil-A",title:"Team Member",type:"Part-Time",pay:"$13-14/hr",tags:["No Exp","16+","Flexible"],logo:<FaDrumstickBite />,clr:"#E51636",loc:"Multiple DFW Locations",la:32.900,lo:-96.750,sched:"Flexible including weekends",train:"Same-day training",desc:"Join the brand known for the best customer service in fast food.",posted:"Today",spots:15,qs:[]},
  {id:17,co:"Starbucks",title:"Barista",type:"Part-Time",pay:"$13-15/hr",tags:["No Exp","16+","Benefits"],logo:<FaMugHot />,clr:"#00704A",loc:"Plano, TX",la:33.020,lo:-96.699,sched:"Flexible including mornings",train:"Full barista training",desc:"Join the iconic green apron team and learn drinks, customer connection, and teamwork.",posted:"1d ago",spots:5,qs:[]},
  {id:18,co:"Children's Health",title:"Hospital Volunteer Intern",type:"Internship",pay:"Stipend",tags:["College","Healthcare"],logo:<FaHospital />,clr:"#0072CE",loc:"Dallas Medical District",la:32.812,lo:-96.840,sched:"Flexible weekdays",train:"Clinical mentorship",desc:"Shadow healthcare professionals at one of the nation's top pediatric hospitals.",posted:"Today",spots:4,qs:["What healthcare field interests you most?","Are you comfortable in a hospital?"]},
  {id:19,co:"Target",title:"Sales Floor Team Member",type:"Part-Time",pay:"$15/hr",tags:["16+","No Exp","Flexible"],logo:<FaShoppingBag />,clr:"#CC0000",loc:"Garland, TX",la:32.913,lo:-96.639,sched:"Flexible scheduling",train:"Week-long paid onboarding",desc:"Help guests find what they need and create a great shopping experience.",posted:"2d ago",spots:10,qs:[]},
  {id:20,co:"Tesla",title:"Service Center Intern",type:"Internship",pay:"$18/hr",tags:["College","Tech","STEM"],logo:<FaCar />,clr:"#CC0000",loc:"North Dallas",la:32.950,lo:-96.800,sched:"Mon-Fri 9am-4pm",train:"EV technology training",desc:"Learn electric vehicle service and diagnostics at one of Tesla's Dallas service centers.",posted:"Today",spots:2,qs:["What interests you about electric vehicles?"]},
  {id:21,co:"City of Dallas Parks",title:"Summer Recreation Leader",type:"Seasonal",pay:"$13/hr",tags:["16+","Summer","Outdoors"],logo:<FaLeaf />,clr:"#27AE60",loc:"Dallas Parks - Various",la:32.790,lo:-96.820,sched:"Mon-Fri Jun-Aug",train:"Recreation leadership cert",desc:"Lead games and activities for youth at Dallas community centers all summer.",posted:"1d ago",spots:12,qs:[]},
  {id:22,co:"AMC Theatres",title:"Team Member",type:"Part-Time",pay:"$11-12/hr",tags:["16+","No Exp","Evenings"],logo:<FaFilm />,clr:"#FF0000",loc:"Mesquite, TX",la:32.767,lo:-96.599,sched:"Evenings and weekends",train:"On-site training",desc:"Work at the movies! Sell tickets, run concessions, and help guests have an amazing night.",posted:"4d ago",spots:7,qs:[]},
];

var BIZ_IDS = [1, 28, 29];

var LOCAL_APPS = [
  {id:"app-2",jobId:2,status:"accepted",applied:"Mar 10",note:"Great profile! We would love to have you join us.",iv:{date:"Apr 5, 2026",time:"2:00 PM",loc:"AT&T Downtown Office, 208 S. Akard St",notes:"Bring your resume and arrive 10 minutes early."}},
  {id:"app-5",jobId:5,status:"declined",applied:"Mar 8",note:"Position filled this cycle. Apply again next semester!",iv:null},
  {id:"app-9",jobId:9,status:"pending",applied:"Mar 20",note:"",iv:null},
];

var LOCAL_APPLICANTS = [
  {id:1,jobId:1,name:"Jordan Lee",school:"W.T. White HS",grade:"10th",age:"16",email:"jordan@email.com",applied:"Mar 25",status:"pending",note:"I love coffee and work every weekend!",ans:{"What days can you work?":"Fri, Sat, Sun","Any customer service experience?":"I volunteer at my church welcome desk."},iv:null},
  {id:2,jobId:1,name:"Sofia Reyes",school:"Kimball HS",grade:"11th",age:"17",email:"sofia.r@email.com",applied:"Mar 26",status:"pending",note:"",ans:{"What days can you work?":"Sat and Sun","Any customer service experience?":"Yes, at my school carnival food stand."},iv:null},
  {id:3,jobId:28,name:"Marcus Green",school:"Skyline HS",grade:"12th",age:"18",email:"marcus.g@email.com",applied:"Mar 24",status:"pending",note:"Been team captain for two years.",ans:{"Describe a time you led a group.":"Led a 5-person AP History project.","Available mornings?":"Yes, up at 5am for swim practice."},iv:null},
  {id:4,jobId:29,name:"Tyler Brooks",school:"Lake Highlands HS",grade:"9th",age:"15",email:"tyler.b@email.com",applied:"Mar 20",status:"pending",note:"",ans:{"Comfortable with early morning shifts?":"Yes, I wake up early for school."},iv:null},
];

var PRESET_SKILLS = ["Customer Service","Teamwork","Communication","Microsoft Office","Google Workspace","Canva","Social Media","Photography","Public Speaking","Leadership","Time Management","Sales","Cash Handling","Data Entry","Excel","Spanish","Research","Writing","First Aid / CPR","Animal Care","Childcare","Cooking","Coding","Math Tutoring","Event Planning"];

var EX_DATA = {firstName:"Morgan",lastName:"Taylor",email:"morgan.taylor@gmail.com",phone:"(214) 555-8834",school:"Jesuit College Prep",grade:"12th Grade",gpa:"3.9",summary:"Detail-oriented senior with leadership experience. Starting UT Austin Fall 2026.",skills:["Customer Service","Excel","Canva","Public Speaking","Bilingual Spanish"],activities:["Student Council President","National Honor Society VP","Varsity Cross Country Captain"],experience:[{role:"Sales Associate",org:"Barnes and Noble",dates:"Aug 2024-Present",desc:"Assisted customers, ran POS system. Employee of the Month Dec 2024."},{role:"Camp Counselor",org:"City of Dallas",dates:"Jun-Aug 2024",desc:"Led STEM activities for 25 campers with a team of 6 counselors."},{role:"Tutor",org:"Schoolhouse.world",dates:"Sep 2023-Present",desc:"Helped 4 students improve from C to A in math and English."}]};

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
var BG="#080D18",SF="#0F1624",CD="#141C2E",BR="rgba(255,255,255,0.07)";
var PR="#00C896",OR="#FF6B35",TX="#E4EAF4",MU="#5A6A88",DN="#EF4444",WN="#F59E0B",BL="#3B82F6";
var FH="'Bricolage Grotesque',sans-serif",FB="'Plus Jakarta Sans',sans-serif";
function pill(c,bg){return{background:bg||c+"22",color:c,border:"1px solid "+c+"44",borderRadius:7,padding:"2px 9px",fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center"};}
function bx(x){return Object.assign({background:CD,border:"1px solid "+BR,borderRadius:14,padding:18},x||{});}
var INP={background:SF,border:"1px solid "+BR,borderRadius:9,color:TX,fontSize:13,padding:"9px 13px",fontFamily:FB,width:"100%",boxSizing:"border-box",outline:"none"};

function Btn(props){
  var bg=props.v==="pr"||!props.v?PR:props.v==="dn"?DN:props.v==="or"?OR:"rgba(255,255,255,0.08)";
  return <div onClick={props.onClick} style={Object.assign({background:bg,color:props.v==="gh"?TX:"#000",border:props.v==="gh"?"1px solid "+BR:"none",borderRadius:10,fontFamily:FB,fontWeight:800,padding:props.lg?"13px 26px":props.sm?"6px 13px":"9px 18px",fontSize:props.lg?15:props.sm?12:13,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5},props.sx||{})}>{props.ch}</div>;
}
function Lbl(props){return <p style={{color:MU,fontSize:11,fontWeight:700,marginBottom:4}}>{props.t}</p>;}
function Inp(props){return <input value={props.v} onChange={props.onChange} placeholder={props.ph} type={props.tp||"text"} style={Object.assign({},INP,props.sx||{})}/>;}
function Txa(props){return <textarea value={props.v} onChange={props.onChange} placeholder={props.ph} style={Object.assign({},INP,{height:props.h||72,resize:"vertical"})}/>;}

function Modal(props){
  return(
    <div onClick={function(e){if(e.target===e.currentTarget)props.onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:SF,border:"1px solid "+BR,borderRadius:20,width:"100%",maxWidth:props.w||480,maxHeight:"88vh",overflowY:"auto"}}>{props.children}</div>
    </div>
  );
}

function Sidebar(props){
  return(
    <div style={{width:210,background:SF,borderRight:"1px solid "+BR,display:"flex",flexDirection:"column",position:"sticky",top:0,height:"100vh",flexShrink:0}}>
      <div style={{padding:"16px 14px 12px",borderBottom:"1px solid "+BR,display:"flex",alignItems:"center",gap:9}}>
        <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,"+props.ac+","+( props.ac===PR?"#0055FF":"#FF3B80")+")",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#000",fontWeight:800}}>{props.ac===PR?<FaStar size={16} />:<FaBriefcase size={16} />}</div>
        <div><p style={{fontFamily:FH,fontWeight:800,fontSize:13,color:"#fff"}}>LaunchDFW</p><p style={{color:MU,fontSize:10}}>{props.ac===PR?"Student Portal":"Employer Portal"}</p></div>
      </div>
      <nav style={{flex:1,padding:9,overflowY:"auto"}}>
        {props.items.map(function(it){
          return(
            <div key={it.id} onClick={function(){props.set(it.id);}} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 10px",borderRadius:10,marginBottom:2,cursor:"pointer",color:props.cur===it.id?props.ac:MU,fontWeight:600,fontSize:13,background:props.cur===it.id?(props.ac+"1A"):"transparent",transition:"all 0.13s"}}>
              <span style={{fontSize:15}}>{it.ic}</span>
              <span style={{flex:1}}>{it.lb}</span>
              {it.b!=null&&<span style={{background:it.bc||props.ac,color:"#000",borderRadius:20,padding:"2px 7px",fontSize:10,fontWeight:800}}>{it.b}</span>}
            </div>
          );
        })}
      </nav>
      <div style={{padding:"10px 12px",borderTop:"1px solid "+BR}}>
        {props.ac===PR&&!sb&&<div style={{background:WN+"11",border:"1px solid "+WN+"33",borderRadius:9,padding:"8px 10px",marginBottom:8}}><p style={{color:WN,fontSize:10,fontWeight:800,marginBottom:2}}><FaExclamationTriangle /> Demo Mode</p><p style={{color:MU,fontSize:10}}>Add Supabase keys to go live</p></div>}
        {sb&&<div style={{background:PR+"11",border:"1px solid "+PR+"33",borderRadius:9,padding:"8px 10px",marginBottom:8}}><p style={{color:PR,fontSize:10,fontWeight:800}}><FaLock /> Connected to Supabase</p></div>}
        <div onClick={props.onLogout} style={{display:"flex",alignItems:"center",gap:8,color:MU,fontSize:12,padding:"7px 9px",borderRadius:8,border:"1px solid "+BR,cursor:"pointer"}}><FaDoorOpen /> Log Out</div>
      </div>
    </div>
  );
}

function ResumeCard(props){
  var data=props.data,tid=props.tid||"classic";
  var clr=tid==="modern"?"#00C896":tid==="bold"?"#F59E0B":"#2563EB";
  var s9={fontSize:9,lineHeight:1.5,color:"#444"};
  if(tid==="modern"){return(
    <div style={{background:"#fff",borderRadius:11,overflow:"hidden",boxShadow:"0 6px 22px rgba(0,0,0,0.28)",fontFamily:"Georgia,serif",color:"#222"}}>
      <div style={{display:"flex",minHeight:300}}>
        <div style={{width:110,background:clr,padding:"12px 9px",flexShrink:0}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:"rgba(255,255,255,0.2)",margin:"0 auto 10px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}><FaUser size={15} /></div>
          <p style={{color:"rgba(255,255,255,0.6)",fontSize:7,fontWeight:700,marginBottom:4}}>SKILLS</p>
          {data.skills.map(function(sk){return <p key={sk} style={{color:"#fff",fontSize:8,marginBottom:2}}>{sk}</p>;})}
          <div style={{borderTop:"1px solid rgba(255,255,255,0.3)",margin:"8px 0"}}/>
          <p style={{color:"rgba(255,255,255,0.6)",fontSize:7,fontWeight:700,marginBottom:4}}>ACTIVITIES</p>
          {data.activities.filter(Boolean).map(function(a){return <p key={a} style={{color:"#fff",fontSize:8,marginBottom:2}}>{a}</p>;})}
        </div>
        <div style={{flex:1,padding:12}}>
          <p style={{fontSize:15,fontWeight:800,color:"#111",fontFamily:"serif",marginBottom:2}}>{data.firstName} {data.lastName}</p>
          <p style={{fontSize:9,color:"#555"}}>{data.school} - {data.grade}{data.gpa?" - GPA "+data.gpa:""}</p>
          <p style={{fontSize:9,color:"#555",marginBottom:6}}>{data.email}</p>
          <div style={{height:1,background:clr+"66",margin:"7px 0"}}/>
          <p style={Object.assign({},s9,{marginBottom:8})}>{data.summary}</p>
          {data.experience.length>0&&<div><p style={{fontWeight:800,fontSize:7,color:clr,letterSpacing:1,marginBottom:4}}>EXPERIENCE</p>{data.experience.map(function(e,i){return <div key={i} style={{marginBottom:6}}><p style={{fontWeight:700,fontSize:9}}>{e.role} at {e.org}</p><p style={{color:"#888",fontSize:8,marginBottom:1}}>{e.dates}</p><p style={s9}>{e.desc}</p></div>;})}</div>}
        </div>
      </div>
    </div>
  );}
  if(tid==="bold"){return(
    <div style={{background:"#fff",borderRadius:11,overflow:"hidden",boxShadow:"0 6px 22px rgba(0,0,0,0.28)",fontFamily:"Georgia,serif",color:"#222"}}>
      <div style={{background:clr,padding:"11px 14px"}}><p style={{fontSize:16,fontWeight:900,color:"#fff",marginBottom:2}}>{data.firstName} {data.lastName}</p><p style={{fontSize:9,color:"rgba(255,255,255,0.8)"}}>{data.school} - {data.email}</p></div>
      <div style={{padding:13}}>
        <p style={Object.assign({},s9,{marginBottom:8})}>{data.summary}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><p style={{fontWeight:800,fontSize:7,color:clr,letterSpacing:1,marginBottom:3}}>SKILLS</p>{data.skills.map(function(sk){return <p key={sk} style={Object.assign({},s9,{marginBottom:2})}>{sk}</p>;})}</div>
          <div><p style={{fontWeight:800,fontSize:7,color:clr,letterSpacing:1,marginBottom:3}}>ACTIVITIES</p>{data.activities.filter(Boolean).map(function(a){return <p key={a} style={Object.assign({},s9,{marginBottom:2})}>{a}</p>;})}</div>
        </div>
        {data.experience.length>0&&<div style={{marginTop:8}}><p style={{fontWeight:800,fontSize:7,color:clr,letterSpacing:1,marginBottom:3}}>EXPERIENCE</p>{data.experience.map(function(e,i){return <div key={i} style={{marginBottom:5}}><p style={{fontWeight:700,fontSize:8}}>{e.role} at {e.org} - {e.dates}</p><p style={s9}>{e.desc}</p></div>;})}</div>}
      </div>
    </div>
  );}
  return(
    <div style={{background:"#fff",borderRadius:11,overflow:"hidden",boxShadow:"0 6px 22px rgba(0,0,0,0.28)",fontFamily:"Georgia,serif",color:"#222"}}>
      <div style={{padding:14}}>
        <div style={{textAlign:"center",marginBottom:8}}>
          <p style={{fontSize:15,fontWeight:800,color:"#111",fontFamily:"serif",marginBottom:2}}>{data.firstName} {data.lastName}</p>
          <p style={{fontSize:9,color:"#555"}}>{data.school} - {data.grade}{data.gpa?" - GPA "+data.gpa:""}</p>
          <p style={{fontSize:9,color:"#555"}}>{data.email} - {data.phone}</p>
        </div>
        <div style={{height:2,background:clr,marginBottom:7}}/>
        <p style={Object.assign({},s9,{marginBottom:8})}>{data.summary}</p>
        {data.experience.length>0&&<div><p style={{fontWeight:700,fontSize:8,borderBottom:"1px solid "+clr,paddingBottom:2,marginBottom:5}}>EXPERIENCE</p>{data.experience.map(function(e,i){return <div key={i} style={{marginBottom:5}}><div style={{display:"flex",justifyContent:"space-between"}}><p style={{fontWeight:700,fontSize:9}}>{e.role}, {e.org}</p><p style={{fontSize:8,color:"#666"}}>{e.dates}</p></div><p style={s9}>{e.desc}</p></div>;})}</div>}
        <p style={{fontWeight:700,fontSize:8,borderBottom:"1px solid "+clr,paddingBottom:2,margin:"7px 0 5px"}}>SKILLS AND ACTIVITIES</p>
        <p style={{fontSize:9,color:"#444"}}>{data.skills.concat(data.activities.filter(Boolean)).join(", ")}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────
export default function App(){
  var [screen,setScreen]=useState("login");
  var [user,setUser]=useState(null); // {uid, role, name}
  var [toast,setToast]=useState(null);

  function show(msg,t){setToast({msg,t:t||"ok"});setTimeout(function(){setToast(null);},3200);}

  function handleLogin(u){setUser(u);setScreen(u.role);}
  function handleLogout(){setUser(null);setScreen("login");if(sb)sb.auth.signOut();}

  // Check if already signed in on load
  useEffect(function(){
    if(!sb)return;
    sb.auth.getSession().then(function(res){
      if(res.data&&res.data.session){
        var uid=res.data.session.user.id;
        sb.from("profiles").select("role,first_name,last_name").eq("id",uid).maybeSingle().then(function(p){
          if(!p.error && p.data) handleLogin({uid,role:p.data.role,name:p.data.first_name+" "+p.data.last_name});
        });
      }
    });
  },[]);

  return(
    <div style={{minHeight:"100vh",background:BG,fontFamily:FB,color:TX}}>
      <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:8px}.hov:hover{opacity:0.85}.jc{transition:all .15s;cursor:pointer}.jc:hover{background:#1A2540!important;transform:translateY(-1px)}.ni{transition:all .12s;cursor:pointer}.ni:hover{background:rgba(255,255,255,.07)!important}input,textarea,select{color-scheme:dark}textarea{resize:vertical;font-family:'Plus Jakarta Sans',sans-serif}`}</style>
      {screen==="login"   &&<LoginScreen onLogin={handleLogin} show={show}/>}
      {screen==="student" &&<StudentApp user={user} show={show} logout={handleLogout}/>}
      {screen==="business"&&<BizApp     user={user} show={show} logout={handleLogout}/>}
      {toast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:toast.t==="err"?DN:toast.t==="info"?BL:PR,color:toast.t==="info"?"#fff":"#000",borderRadius:12,padding:"10px 20px",fontWeight:700,fontSize:13,zIndex:999,whiteSpace:"nowrap"}}>{toast.t==="err"?<FaTimes />:<FaCheck />} {toast.msg}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────
function LoginScreen(props){
  var [mode,setMode]=useState("pick");
  var [email,setEmail]=useState("");
  var [pw,setPw]=useState("");
  var [name,setName]=useState("");
  var [school,setSchool]=useState("");
  var [company,setCompany]=useState("");
  var [isNew,setIsNew]=useState(false);
  var [loading,setLoading]=useState(false);

  async function handleStudentAuth(){
    if(!email||!pw){props.show("Enter email and password","err");return;}
    if(isNew&&!name){props.show("Enter your full name","err");return;}
    setLoading(true);
    if(!sb){
      // Demo mode - no real auth
      props.onLogin({uid:"demo-student",role:"student",name:name||"Alex Johnson"});
      setLoading(false);return;
    }
    var res;
    if(isNew){
      res=await dbSignUp(email,pw,"student",{firstName:name.split(" ")[0],lastName:name.split(" ")[1]||"",school});
    } else {
      res=await dbSignIn(email,pw);
    }
    setLoading(false);
    if(res.error){props.show(res.error==="not_connected"?"Add your Supabase keys to connect":res.error,"err");return;}
    props.onLogin({uid:res.uid||res.uid,role:"student",name:res.name||name});
  }

  async function handleBizAuth(){
    if(!email||!pw){props.show("Enter email and password","err");return;}
    if(isNew&&(!name||!company)){props.show("Enter your name and company","err");return;}
    setLoading(true);
    if(!sb){
      props.onLogin({uid:"demo-biz",role:"business",name:company||"Houndstooth Coffee"});
      setLoading(false);return;
    }
    var res;
    if(isNew){
      res=await dbSignUp(email,pw,"employer",{firstName:name.split(" ")[0],lastName:name.split(" ")[1]||"",company});
    } else {
      res=await dbSignIn(email,pw);
    }
    setLoading(false);
    if(res.error){props.show(res.error==="not_connected"?"Add your Supabase keys to connect":res.error,"err");return;}
    props.onLogin({uid:res.uid,role:"business",name:company||res.name});
  }

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 80% 50% at 50% 0%,rgba(0,200,150,0.1),transparent 60%)",pointerEvents:"none"}}/>
      <div style={{textAlign:"center",marginBottom:32,position:"relative"}}>
        <div style={{width:60,height:60,borderRadius:18,background:"linear-gradient(135deg,"+PR+",#0055FF)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",boxShadow:"0 0 36px "+PR+"44"}}><FaStar size={28} color="#fff" /></div>
        <h1 style={{fontFamily:FH,fontSize:32,fontWeight:800,color:"#fff"}}>LaunchDFW</h1>
        <p style={{color:MU,fontSize:13,marginTop:4}}>Safe student employment - Dallas Metroplex</p>
        {!sb&&<p style={{color:WN,fontSize:11,marginTop:6,background:WN+"11",border:"1px solid "+WN+"33",borderRadius:8,padding:"4px 12px",display:"inline-block"}}><FaExclamationTriangle /> Demo mode - Supabase not connected yet</p>}
      </div>

      {mode==="pick"&&(
        <div style={{width:"100%",maxWidth:540}}>
          <p style={{textAlign:"center",color:MU,fontSize:12,fontWeight:700,letterSpacing:0.8,marginBottom:20}}>I AM A...</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {[{t:"student",ic:<FaGraduationCap size={26} />,title:"Student",ac:PR,bl:["Find jobs and internships","Resume builder","Application tracker","Interview prep"]},{t:"business",ic:<FaBuilding size={26} />,title:"Employer",ac:OR,bl:["Post jobs with custom questions","Review applicant resumes","Accept or decline applicants","Schedule interviews"]}].map(function(o){
              return(
                <div key={o.t} className="jc" onClick={function(){setMode(o.t);}} style={bx({padding:24,cursor:"pointer"})}>
                  <div style={{width:48,height:48,borderRadius:14,background:o.ac+"22",border:"1px solid "+o.ac+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,marginBottom:14}}>{o.ic}</div>
                  <h2 style={{fontFamily:FH,fontSize:18,fontWeight:800,color:"#fff",marginBottom:12}}>{o.title}</h2>
                  {o.bl.map(function(b){return <p key={b} style={{color:"#ccc",fontSize:12,marginBottom:5}}><FaCheck /> {b}</p>;})}
                  <div style={{background:o.ac,color:"#000",borderRadius:9,padding:"10px 0",textAlign:"center",fontWeight:800,fontSize:13,marginTop:14}}>Get Started</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(mode==="student"||mode==="business")&&(
        <div style={{width:"100%",maxWidth:380}}>
          <div style={bx({padding:28})}>
            <p onClick={function(){setMode("pick");}} style={{color:MU,fontSize:13,cursor:"pointer",marginBottom:18}}><FaArrowLeft /> Back</p>
            <div style={{display:"flex",background:BG,borderRadius:10,padding:3,marginBottom:18}}>
              <div onClick={function(){setIsNew(false);}} style={{flex:1,textAlign:"center",padding:"7px 0",borderRadius:8,background:!isNew?SF:"transparent",color:!isNew?"#fff":MU,fontSize:13,fontWeight:700,cursor:"pointer"}}>Sign In</div>
              <div onClick={function(){setIsNew(true);}} style={{flex:1,textAlign:"center",padding:"7px 0",borderRadius:8,background:isNew?SF:"transparent",color:isNew?"#fff":MU,fontSize:13,fontWeight:700,cursor:"pointer"}}>Create Account</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              {isNew&&mode==="student"&&<div><Lbl t="FULL NAME"/><Inp v={name} onChange={function(e){setName(e.target.value);}} ph="Your Full Name"/></div>}
              {isNew&&mode==="student"&&<div><Lbl t="SCHOOL"/><Inp v={school} onChange={function(e){setSchool(e.target.value);}} ph="Skyline High School"/></div>}
              {isNew&&mode==="business"&&<div><Lbl t="COMPANY NAME"/><Inp v={company} onChange={function(e){setCompany(e.target.value);}} ph="Houndstooth Coffee"/></div>}
              {isNew&&mode==="business"&&<div><Lbl t="YOUR NAME"/><Inp v={name} onChange={function(e){setName(e.target.value);}} ph="Your Name"/></div>}
              <div><Lbl t="EMAIL"/><Inp v={email} onChange={function(e){setEmail(e.target.value);}} ph="you@email.com" tp="email"/></div>
              <div><Lbl t="PASSWORD"/><Inp v={pw} onChange={function(e){setPw(e.target.value);}} ph="password" tp="password"/></div>
            </div>
            <Btn ch={loading?"Loading...":(isNew?"Create Account":"Sign In")} v={mode==="student"?"pr":"or"} lg sx={{width:"100%",justifyContent:"center",marginTop:18,background:mode==="business"?OR:PR,color:"#000"}} onClick={mode==="student"?handleStudentAuth:handleBizAuth}/>
            {!sb&&<p style={{textAlign:"center",color:MU,fontSize:11,marginTop:10}}>Demo mode - no real account needed, just press Sign In</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STUDENT APP
// ─────────────────────────────────────────────────────────────
function StudentApp(props){
  var [nav,setNav]=useState("jobs");
  var [selJob,setSelJob]=useState(null);
  var [jobs,setJobs]=useState(LOCAL_JOBS);
  var [apps,setApps]=useState(LOCAL_APPS);
  var [saved,setSaved]=useState([]);
  var [resume,setResume]=useState(null);
  var [rd,setRd]=useState({firstName:"Alex",lastName:"Johnson",email:"alex.j@email.com",phone:"(214) 555-0192",school:"Skyline High School",grade:"11th Grade",gpa:"3.8",summary:"Motivated student seeking part-time work to build professional skills.",skills:["Customer Service","Microsoft Office","Canva"],activities:["Debate Club Captain","National Honor Society"],experience:[{role:"Volunteer",org:"Dallas Food Bank",dates:"Sep 2024-Present",desc:"Sorted donations for 200+ families per shift."}]});
  var [tmpl,setTmpl]=useState("classic");
  var [prof,setProf]=useState({firstName:"Alex",lastName:"Johnson",email:"alex.j@email.com",phone:"(214) 555-0192",school:"Skyline High School",grade:"11th Grade",age:"17",bio:"Motivated student looking for part-time work in the Dallas area.",skills:["Customer Service","Microsoft Office","Canva"]});
  var [area,setArea]=useState(AREAS[0]);
  var [radius,setRadius]=useState(20);
  var [flt,setFlt]=useState("All");
  var [q,setQ]=useState("");
  var [applyJob,setApplyJob]=useState(null);
  var [applyStep,setApplyStep]=useState(0);
  var [avail,setAvail]=useState(["Sat","Sun"]);
  var [anote,setAnote]=useState("");
  var [aAns,setAAns]=useState({});
  var [resTab,setResTab]=useState("upload");
  var [editP,setEditP]=useState(false);
  var [pd,setPd]=useState(Object.assign({},prof));
  var [rTab,setRTab]=useState("iv");
  var [oqIdx,setOqIdx]=useState(null);
  var [nsk,setNsk]=useState("");
  var [npsk,setNpsk]=useState("");
  var [loading,setLoading]=useState(false);
  var fileRef=useRef();

  useEffect(function(){
    if(!props.user) return;
    var key = "launchdfw_saved_jobs_" + props.user.uid;
    var stored = [];
    try{ stored = JSON.parse(localStorage.getItem(key) || "[]"); }catch{ void 0; }
    if(!Array.isArray(stored)) stored = [];
    setSaved(stored);

    dbLoadSaved(props.user.uid).then(function(data){
      if(Array.isArray(data)){
        var merged = Array.from(new Set(stored.concat(data)));
        setSaved(merged);
        try{ localStorage.setItem(key, JSON.stringify(merged)); }catch{ void 0; }
      }
    });
  },[props.user]);

  useEffect(function(){
    if(!props.user) return;
    var key = "launchdfw_saved_jobs_" + props.user.uid;
    try{ localStorage.setItem(key, JSON.stringify(saved)); }catch{ void 0; }
  },[saved, props.user]);

  // Load real data from Supabase when connected
  useEffect(function(){
    if(!sb||!props.user)return;
    dbLoadJobs().then(function(data){if(data&&data.length)setJobs(data);});
    dbLoadMyApps(props.user.uid).then(function(data){
      if(!data)return;
      var mapped=data.map(function(a){
        var iv=a.interviews&&a.interviews[0]?{date:a.interviews[0].interview_date,time:a.interviews[0].interview_time,loc:a.interviews[0].location,notes:a.interviews[0].notes}:null;
        return {id:a.id,jobId:a.job_id,status:a.status,applied:new Date(a.applied_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}),note:a.note||"",iv};
      });
      setApps(mapped);
    });
    // Load profile data from profiles table
    sb.from("profiles").select("first_name,last_name").eq("id", props.user.uid).maybeSingle().then(function(pdata){
      // Load student data from students table
      sb.from("students").select("email,phone,school,grade,gpa,summary,skills,activities,experience,resume_url,age,bio").eq("id", props.user.uid).maybeSingle().then(function(sdata){
        if(pdata.data || sdata.data){
          setRd(function(r){return Object.assign({}, r, {
            firstName: pdata.data?.first_name || "",
            lastName: pdata.data?.last_name || "",
            email: sdata.data?.email || "",
            phone: sdata.data?.phone || "",
            school: sdata.data?.school || "",
            grade: sdata.data?.grade || "",
            gpa: sdata.data?.gpa || "",
            summary: sdata.data?.summary || "",
            skills: sdata.data?.skills || [],
            activities: sdata.data?.activities || [],
            experience: sdata.data?.experience || [],
            resumeUrl: sdata.data?.resume_url || ""
          });});
          setProf(function(p){return Object.assign({}, p, {
            firstName: pdata.data?.first_name || p.firstName,
            lastName: pdata.data?.last_name || p.lastName,
            email: sdata.data?.email || p.email,
            phone: sdata.data?.phone || p.phone,
            school: sdata.data?.school || p.school,
            grade: sdata.data?.grade || p.grade,
            age: sdata.data?.age || p.age,
            bio: sdata.data?.bio || p.bio,
            skills: sdata.data?.skills || p.skills
          });});
          if(sdata.data?.resume_url){
            // Extract name from URL
            const urlParts = sdata.data.resume_url.split('/');
            const fileName = urlParts[urlParts.length - 1];
            setResume({name: fileName, size: "Uploaded", url: sdata.data.resume_url});
          }
        }
      });
    });
  },[props.user]);

  function hasApp(id){return apps.some(function(a){return a.jobId===id;});}

  async function togSave(id){
    var key = props.user ? "launchdfw_saved_jobs_" + props.user.uid : "launchdfw_saved_jobs";

    function storeSaved(next){
      try{ localStorage.setItem(key, JSON.stringify(next)); }catch{ void 0; }
      return next;
    }

    if(saved.includes(id)){
      var next = saved.filter(function(x){return x!==id;});
      setSaved(storeSaved(next));
      if(sb&&props.user){
        var res = await dbUnsaveJob(props.user.uid,id);
        if(res.error){
          props.show("Removed locally, but server unsave failed","info");
          console.warn("dbUnsaveJob error", res.error);
          return;
        }
      }
      props.show("Removed from saved");
    } else {
      var added = saved.includes(id) ? saved : saved.concat([id]);
      setSaved(storeSaved(added));
      if(sb&&props.user){
        let res = await dbSaveJob(props.user.uid,id);
        if(res.error){
          props.show("Saved locally, but server sync failed: "+res.error,"err");
          console.error("dbSaveJob error", res.error);
          return;
        }
      }
      props.show("Saved!");
    }
  }

  var ivApps=apps.filter(function(a){return a.iv;});
  var FLTS=["All","Part-Time","Internship","Seasonal","No Exp","16+","18+","College","STEM","Creative","Healthcare","Sports","Events","Outdoors"];

  var filteredJobs=jobs.filter(function(j){
    if(flt!=="All"&&j.type!==flt&&!(j.tags||[]).includes(flt))return false;
    if(q&&![j.title,j.co,j.loc].some(function(x){return x.toLowerCase().includes(q.toLowerCase());}))return false;
    if(area.la&&calcMiles(area.la,area.lo,j.la,j.lo)>radius)return false;
    return true;
  });

  async function openApply(job){
    if(!resume){props.show("Upload resume first!","err");setNav("resume");setSelJob(null);return;}
    if(hasApp(job.id)){props.show("Already applied","info");return;}
    setApplyJob(job);setApplyStep(0);setAvail(["Sat","Sun"]);setAnote("");setAAns({});
  }

  async function submitApp(){
    setLoading(true);
    if(sb&&props.user){
      var res=await dbSubmitApp(applyJob.id,props.user.uid,avail,anote,aAns);
      if(res.error){props.show("Could not submit: "+res.error,"err");setLoading(false);return;}
    }
    setApps(function(p){return p.concat([{id:"local-"+Date.now(),jobId:applyJob.id,status:"pending",applied:"Today",note:"",iv:null}]);});
    setApplyJob(null);setSelJob(null);setLoading(false);
    props.show("Application submitted! Success");
  }

  async function saveProfile(){
    setProf(Object.assign({},pd));setEditP(false);
    if(sb&&props.user){
      await dbSaveProfile(props.user.uid, {firstName: pd.firstName, lastName: pd.lastName});
      await dbUpdateProfile(props.user.uid,{school:pd.school,grade:pd.grade,skills:pd.skills,age:pd.age,bio:pd.bio,email:pd.email,phone:pd.phone});
    }
    props.show("Profile updated! Success");
  }

  var navTitles = {
    jobs: <><FaHome /> Job Board</>,
    saved: <><FaHeart /> Saved Jobs</>,
    resume: <><FaFileAlt /> My Resume</>,
    apps: <><FaClipboard /> Applications</>,
    ivs: <><FaCalendar /> Interviews</>,
    tools: <><FaGraduationCap /> Career Tools</>,
    profile: <><FaUser /> My Profile</>
  };

  var qs=applyJob?(applyJob.qs||[]):[];
  var steps=qs.length>0?["Info","Availability","Your Answers","Review"]:["Info","Availability","Review"];

  var navItems=[
    {id:"jobs",ic:<FaHome />,lb:"Job Board"},
    {id:"saved",ic:<FaHeart />,lb:"Saved",b:saved.length||null},
    {id:"resume",ic:<FaFileAlt />,lb:"My Resume",b:!resume?"!":null,bc:!resume?WN:null},
    {id:"apps",ic:<FaClipboard />,lb:"Applications",b:apps.filter(function(a){return a.status==="pending";}).length||null},
    {id:"ivs",ic:<FaCalendar />,lb:"Interviews",b:ivApps.length||null,bc:ivApps.length?PR:null},
    {id:"tools",ic:<FaGraduationCap />,lb:"Career Tools"},
    {id:"profile",ic:<FaUser />,lb:"My Profile"},
  ];

  return(
    <div style={{display:"flex",minHeight:"100vh"}}>
      <Sidebar items={navItems} cur={nav} set={function(id){setNav(id);setSelJob(null);}} ac={PR} onLogout={props.logout}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{background:SF,borderBottom:"1px solid "+BR,padding:"11px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
          <div>
            <h1 style={{fontFamily:FH,fontSize:17,fontWeight:800,color:"#fff"}}>
              {navTitles[nav]}
            </h1>
            <p style={{color:MU,fontSize:11}}>Dallas Metroplex - Spring 2026{props.user&&sb?" - Signed in as "+props.user.name:""}</p>
          </div>
          <div style={{display:"flex",gap:9,alignItems:"center"}}>
            {!resume?<span style={pill(WN)}><FaExclamationTriangle /> Upload resume to apply</span>:<span style={pill(PR)}><FaCheck /> Resume ready</span>}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"20px 22px",display:"flex",gap:0}}>
          <div style={{flex:1,minWidth:0}}>

            {nav==="jobs"&&<StudentJobsPage jobs={filteredJobs} allJobs={jobs} flt={flt} setFlt={setFlt} q={q} setQ={setQ} area={area} setArea={setArea} radius={radius} setRadius={setRadius} setSelJob={setSelJob} saved={saved} togSave={togSave} hasApp={hasApp} FLTS={FLTS}/>}

            {nav==="saved"&&(
              saved.length===0
                ?<div style={bx({textAlign:"center",padding:40})}><p style={{fontSize:36,marginBottom:12}}><FaHeart size={36} /></p><p style={{color:"#fff",fontWeight:700,marginBottom:12}}>No saved jobs yet</p><Btn ch="Browse Jobs" onClick={function(){setNav("jobs");}}/></div>
                :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:11}}>{jobs.filter(function(j){return saved.includes(j.id);}).map(function(j){return <JobCard key={j.id} job={j} saved togSave={togSave} onClick={function(){setSelJob(j);}} applied={hasApp(j.id)} area={area}/>;})}</div>
            )}

            {nav==="resume"&&<StudentResumePage resume={resume} setResume={setResume} rd={rd} setRd={setRd} tmpl={tmpl} setTmpl={setTmpl} tab={resTab} setTab={setResTab} show={props.show} fileRef={fileRef} nsk={nsk} setNsk={setNsk} user={props.user}/>}

            {nav==="apps"&&<AppsView apps={apps} jobs={jobs} setNav={setNav}/>}

            {nav==="ivs"&&<StudentIVView apps={apps} jobs={jobs}/>}

            {nav==="tools"&&<ToolsView tab={rTab} setTab={setRTab} oq={oqIdx} setOq={setOqIdx}/>}

            {nav==="profile"&&(
              <div style={{maxWidth:720}}>
                <div style={bx({marginBottom:14,display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"})}>
                  <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,"+PR+","+OR+")",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><FaUser size={28} color="#fff" /></div>
                  <div style={{flex:1}}>
                    <h2 style={{fontFamily:FH,fontSize:18,fontWeight:800,color:"#fff",marginBottom:2}}>{prof.firstName} {prof.lastName}</h2>
                    <p style={{color:MU,fontSize:12}}>{prof.school} - {prof.grade} - Age {prof.age}</p>
                    <p style={{color:MU,fontSize:12,marginTop:2}}>{prof.bio}</p>
                  </div>
                  <div style={{display:"flex",gap:14,flexShrink:0}}>{[{n:apps.length,icon:<FaEnvelope />,label:"Applied"},{n:apps.filter(function(a){return a.status==="accepted";}).length,icon:<FaCheck />,label:"Accepted"},{n:saved.length,icon:<FaHeart />,label:"Saved"}].map(function(s){return <div key={s.label} style={{textAlign:"center"}}><p style={{fontFamily:FH,fontSize:18,fontWeight:800,color:PR}}>{s.n}</p><p style={{color:MU,fontSize:11}}>{s.icon} {s.label}</p></div>;})}</div>
                  <Btn ch={editP?"Cancel":"Edit Profile"} v={editP?"gh":"pr"} onClick={function(){setPd(Object.assign({},prof));setEditP(!editP);}}/>
                </div>
                {editP?(
                  <div style={bx()}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
                      {[["firstName","First Name"],["lastName","Last Name"],["age","Age"],["grade","Grade"],["email","Email"],["phone","Phone"],["school","School"]].map(function(pair){return <div key={pair[0]}><Lbl t={pair[1].toUpperCase()}/><Inp v={pd[pair[0]]} onChange={function(e){var val=e.target.value;setPd(function(p){return Object.assign({},p,{[pair[0]]:val});});}} /></div>;})}
                    </div>
                    <div style={{marginBottom:9}}><Lbl t="BIO"/><Txa v={pd.bio} onChange={function(e){var val=e.target.value;setPd(function(p){return Object.assign({},p,{bio:val});});}} h={64}/></div>
                    <div style={{marginBottom:14}}>
                      <Lbl t="SKILLS"/>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:7}}>{pd.skills.map(function(sk){return <span key={sk} style={Object.assign({},pill(PR),{cursor:"pointer"})} onClick={function(){setPd(function(p){return Object.assign({},p,{skills:p.skills.filter(function(x){return x!==sk;})});});}}>{sk} x</span>;})}</div>
                      <div style={{display:"flex",gap:8,marginBottom:7}}><Inp v={npsk} onChange={function(e){setNpsk(e.target.value);}} ph="Type a skill..." sx={{flex:1}}/><Btn ch="Add" sm onClick={function(){if(npsk.trim()&&!pd.skills.includes(npsk.trim())){setPd(function(p){return Object.assign({},p,{skills:p.skills.concat([npsk.trim()])});});setNpsk("");};}}/></div>
                      <p style={{color:MU,fontSize:11,marginBottom:6}}>Click to add popular skills:</p>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{PRESET_SKILLS.filter(function(sk){return !pd.skills.includes(sk);}).map(function(sk){return <span key={sk} className="ni" onClick={function(){setPd(function(p){return Object.assign({},p,{skills:p.skills.concat([sk])});});}} style={{background:"rgba(255,255,255,0.05)",border:"1px solid "+BR,borderRadius:7,padding:"3px 9px",fontSize:11,color:MU,cursor:"pointer"}}>+ {sk}</span>;})}</div>
                    </div>
                    <div style={{display:"flex",gap:8}}><Btn ch="Save Changes" lg onClick={saveProfile}/><Btn ch="Cancel" v="gh" onClick={function(){setEditP(false);}}/></div>
                  </div>
                ):(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:13}}>
                    <div style={bx()}><h3 style={{fontFamily:FH,fontSize:13,fontWeight:700,color:"#fff",marginBottom:11}}>Contact Info</h3>{[["Email",prof.email],["Phone",prof.phone],["School",prof.school],["Grade",prof.grade],["Age",prof.age]].map(function(pair){return <div key={pair[0]} style={{marginBottom:8}}><p style={{color:MU,fontSize:10,fontWeight:700}}>{pair[0]}</p><p style={{color:"#fff",fontSize:12,fontWeight:600}}>{pair[1]}</p></div>;})}</div>
                    <div style={bx()}><h3 style={{fontFamily:FH,fontSize:13,fontWeight:700,color:"#fff",marginBottom:11}}>Skills</h3><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{prof.skills.map(function(sk){return <span key={sk} style={pill(PR)}>{sk}</span>;})}</div></div>
                  </div>
                )}
              </div>
            )}
          </div>

          {selJob&&(
            <div style={{width:360,marginLeft:16,flexShrink:0}}>
              <div style={{background:SF,border:"1px solid "+BR,borderRadius:18,overflow:"hidden",position:"sticky",top:0,maxHeight:"calc(100vh - 100px)",overflowY:"auto"}}>
                <div style={{background:selJob.clr+"22",padding:"14px 16px 12px",borderBottom:"1px solid "+BR}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:11}}>
                    <Btn ch="Close" v="gh" sm onClick={function(){setSelJob(null);}}/>
                    <span className="hov" onClick={function(){togSave(selJob.id);}} style={{fontSize:18,cursor:"pointer"}}>{saved.includes(selJob.id)?<FaHeart color="#ff0000" />:<FaHeart />}</span>
                  </div>
                  <div style={{display:"flex",gap:11,alignItems:"center"}}>
                    <div style={{width:48,height:48,borderRadius:13,background:selJob.clr+"22",border:"2px solid "+selJob.clr+"55",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{selJob.logo}</div>
                    <div>
                      <h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff",marginBottom:2}}>{selJob.title}</h2>
                      <p style={{color:MU,fontSize:12}}>{selJob.co} - {selJob.loc}</p>
                      {area.la&&<p style={{color:PR,fontSize:11,marginTop:2}}><FaMapMarker /> {calcMiles(area.la,area.lo,selJob.la,selJob.lo)} miles away</p>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:9}}>
                    <span style={pill(selJob.clr)}>{selJob.type}</span>
                    <span style={pill("#10B981")}>{selJob.pay}</span>
                    {(selJob.tags||[]).map(function(t){return <span key={t} style={pill(MU,"rgba(255,255,255,0.04)")}>{t}</span>;})}
                  </div>
                </div>
                <div style={{padding:"13px 16px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                    {[["Schedule",selJob.sched],["Training",selJob.train],["Location",selJob.loc],["Spots",(selJob.spots||1)+" open"]].map(function(pair){return <div key={pair[0]} style={bx({padding:9})}><p style={{color:MU,fontSize:9,fontWeight:700,marginBottom:1}}>{pair[0].toUpperCase()}</p><p style={{color:TX,fontSize:11,fontWeight:700}}>{pair[1]}</p></div>;})}
                  </div>
                  <p style={{color:MU,fontSize:12,lineHeight:1.7,marginBottom:12}}>{selJob.desc}</p>
                  {selJob.qs&&selJob.qs.length>0&&(
                    <div style={{background:BL+"0A",border:"1px solid "+BL+"33",borderRadius:9,padding:"10px 12px",marginBottom:12}}>
                      <p style={{color:BL,fontSize:11,fontWeight:800,marginBottom:5}}><FaQuestion /> {selJob.qs.length} employer question{selJob.qs.length>1?"s":""}</p>
                      {selJob.qs.map(function(q2,i){return <p key={i} style={{color:"#BAE6FD",fontSize:12,marginBottom:3}}>- {q2}</p>;})}
                    </div>
                  )}
                  <div style={{background:"rgba(0,200,150,0.07)",border:"1px solid "+PR+"33",borderRadius:9,padding:"10px 12px",marginBottom:12}}><p style={{color:PR,fontSize:11,fontWeight:800,marginBottom:2}}><FaLock /> Safe Communication</p><p style={{color:"#6EE7B7",fontSize:11}}>All messages stay in-app. Contact info is never shared.</p></div>
                  {!resume&&<div style={{background:"rgba(245,158,11,0.08)",border:"1px solid "+WN+"44",borderRadius:9,padding:"10px 12px",marginBottom:10}}><p style={{color:WN,fontSize:12,fontWeight:800}}>Warning: Upload resume to apply</p></div>}
                  {hasApp(selJob.id)
                    ?<div style={{background:"rgba(0,200,150,0.1)",border:"1px solid "+PR+"44",borderRadius:11,padding:13,textAlign:"center"}}><p style={{fontSize:24,marginBottom:4}}><FaCheck size={24} /></p><p style={{color:PR,fontWeight:800,fontSize:13}}>Already Applied! Check Applications.</p></div>
                    :<Btn ch={resume?"Apply Now":"Upload Resume First"} lg sx={{width:"100%",justifyContent:"center"}} onClick={function(){openApply(selJob);}}/>
                  }
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {applyJob&&(
        <Modal onClose={function(){setApplyJob(null);}}>
          <div style={{padding:"14px 18px",borderBottom:"1px solid "+BR,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><p style={{color:PR,fontSize:10,fontWeight:800,marginBottom:2}}>APPLYING TO {applyJob.co.toUpperCase()}</p><h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff"}}>{applyJob.title}</h2></div>
            <Btn ch="X" v="gh" sm onClick={function(){setApplyJob(null);}}/>
          </div>
          <div style={{padding:"12px 18px 18px"}}>
            <div style={{display:"flex",gap:4,marginBottom:14}}>{steps.map(function(s,i){return <div key={s} style={{flex:1,textAlign:"center"}}><div style={{width:20,height:20,borderRadius:"50%",background:i<=applyStep?PR:"rgba(255,255,255,0.1)",color:i<=applyStep?"#000":MU,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 3px"}}>{i+1}</div><p style={{color:i===applyStep?PR:MU,fontSize:9,fontWeight:700}}>{s}</p></div>;})}
            </div>
            {applyStep===0&&<div><p style={{color:MU,fontSize:13,marginBottom:9}}>Applying as: {rd.firstName} {rd.lastName} - {rd.school}</p><div style={{display:"flex",gap:9,background:"rgba(0,200,150,0.07)",border:"1px solid "+PR+"33",borderRadius:9,padding:"10px 12px",alignItems:"center"}}><span style={{color:PR,fontSize:12,fontWeight:700}}><FaFileAlt /> {resume?resume.name+" attached":"No resume"}</span></div></div>}
            {applyStep===1&&<div><p style={{color:MU,fontSize:13,marginBottom:9}}>Select days you are available.</p><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:11}}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(function(d){return <div key={d} className="ni" onClick={function(){setAvail(function(p){return p.includes(d)?p.filter(function(x){return x!==d;}):p.concat([d]);});}} style={{background:avail.includes(d)?PR+"22":"rgba(255,255,255,0.04)",border:"1px solid "+(avail.includes(d)?PR:BR),color:avail.includes(d)?PR:MU,borderRadius:8,padding:"6px 11px",fontSize:12,fontWeight:700}}>{d}</div>;})} </div><Lbl t="NOTE TO EMPLOYER (optional)"/><Txa v={anote} onChange={function(e){setAnote(e.target.value);}} ph="Why you are excited about this role..." h={64}/></div>}
            {applyStep===2&&qs.length>0&&<div><p style={{color:MU,fontSize:13,marginBottom:11}}>Answer the employer questions.</p>{qs.map(function(q2,i){return <div key={i} style={{marginBottom:11}}><Lbl t={"Q"+(i+1)+": "+q2}/><Txa v={aAns[q2]||""} onChange={function(e){var val=e.target.value;setAAns(function(p){return Object.assign({},p,{[q2]:val});});}} ph="Your answer..." h={60}/></div>;})}</div>}
            {applyStep===steps.length-1&&<div><p style={{color:MU,fontSize:13,marginBottom:11}}>Review before submitting.</p><div style={bx({marginBottom:11})}>{[["Job",applyJob.title+" at "+applyJob.co],["Available",avail.join(", ")||"Not set"],["Resume",resume?resume.name:"None"]].map(function(pair){return <div key={pair[0]} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+BR,fontSize:12}}><span style={{color:MU}}>{pair[0]}</span><span style={{color:"#fff",fontWeight:700}}>{pair[1]}</span></div>;})}</div></div>}
            <div style={{display:"flex",gap:8,marginTop:13}}>
              {applyStep>0&&<Btn ch="Back" v="gh" onClick={function(){setApplyStep(function(s){return s-1;});}}/>}
              <Btn ch={loading?"Submitting...":(applyStep<steps.length-1?"Continue":"Submit Application")} lg sx={{flex:1,justifyContent:"center"}} onClick={function(){applyStep<steps.length-1?setApplyStep(function(s){return s+1;}):submitApp();}}/>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StudentJobsPage(props){
  return(
    <div>
      <div style={{background:"linear-gradient(135deg,#0A1628,#0D1F3C)",border:"1px solid rgba(0,200,150,0.2)",borderRadius:16,padding:"16px 20px",marginBottom:14}}>
        <p style={{color:PR,fontSize:10,fontWeight:800,letterSpacing:2,marginBottom:3}}><FaMapMarker /> DALLAS METROPLEX - VERIFIED EMPLOYERS ONLY</p>
        <h2 style={{fontFamily:FH,fontSize:19,fontWeight:800,color:"#fff",marginBottom:4}}>{props.allJobs.length} Student Opportunities in DFW</h2>
        <p style={{color:MU,fontSize:12,marginBottom:10}}>Safe - Age-Appropriate - No Network Needed</p>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {[{n:props.allJobs.filter(function(j){return j.posted==="Today";}).length,l:"New Today"},{n:"100%",l:"Verified"},{n:"$11-20/hr",l:"Pay Range"},{n:props.allJobs.length,l:"Total Jobs"}].map(function(s){return <div key={s.l} style={{textAlign:"center"}}><p style={{fontFamily:FH,fontSize:18,fontWeight:800,color:PR}}>{s.n}</p><p style={{color:MU,fontSize:10}}>{s.l}</p></div>;})}
        </div>
      </div>
      <div style={bx({marginBottom:14,borderColor:PR+"33"})}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{color:PR,fontWeight:800,fontSize:13}}><FaMapMarker /> Filter by Distance</span>{props.area.la&&<span style={pill(PR)}>Active</span>}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 200px",gap:12,alignItems:"end"}}>
          <div><Lbl t="YOUR LOCATION"/><select value={props.area.l} onChange={function(e){props.setArea(AREAS.find(function(a){return a.l===e.target.value;})||AREAS[0]);}} style={Object.assign({},INP,{cursor:"pointer"})}>{AREAS.map(function(a){return <option key={a.l}>{a.l}</option>;})}</select></div>
          <div><Lbl t={"RADIUS: "+props.radius+" MI"}/><input type="range" min={5} max={50} step={5} value={props.radius} onChange={function(e){props.setRadius(parseInt(e.target.value));}} style={{width:"100%",accentColor:PR}}/><div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:MU,fontSize:10}}>5mi</span><span style={{color:MU,fontSize:10}}>50mi</span></div></div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:9}}>
        <div style={{flex:1,background:SF,border:"1px solid "+BR,borderRadius:9,padding:"8px 12px",display:"flex",gap:7,alignItems:"center"}}>
          <span><FaSearch /></span><input value={props.q} onChange={function(e){props.setQ(e.target.value);}} placeholder="Search jobs, companies, locations..." style={{background:"transparent",border:"none",color:TX,fontSize:13,fontFamily:FB,flex:1,outline:"none"}}/>{props.q&&<span onClick={function(){props.setQ("");}} style={{color:MU,cursor:"pointer"}}>x</span>}
        </div>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {props.FLTS.map(function(f){return <div key={f} className="ni" onClick={function(){props.setFlt(f);}} style={{background:props.flt===f?PR:SF,color:props.flt===f?"#000":MU,border:"1px solid "+(props.flt===f?PR:BR),borderRadius:18,padding:"5px 12px",fontSize:12,fontWeight:700}}>{f}</div>;})}
      </div>
      <p style={{color:MU,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:10}}>{props.jobs.length} JOBS FOUND{props.area.la?" WITHIN "+props.radius+"MI":""}</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:11}}>
        {props.jobs.map(function(j){return <JobCard key={j.id} job={j} saved={props.saved.includes(j.id)} togSave={props.togSave} onClick={function(){props.setSelJob(j);}} applied={props.hasApp(j.id)} area={props.area}/>;}) }
      </div>
      {props.jobs.length===0&&<p style={{color:MU,textAlign:"center",padding:"40px 0"}}>No jobs match. Try adjusting filters or radius.</p>}
    </div>
  );
}

function JobCard(props){
  var job=props.job,area=props.area;
  var d=area&&area.la?calcMiles(area.la,area.lo,job.la,job.lo):null;
  return(
    <div className="jc" onClick={props.onClick} style={bx({padding:14,position:"relative"})}>
      <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
        <div style={{width:46,height:46,borderRadius:12,background:job.clr+"22",border:"1px solid "+job.clr+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{job.logo}</div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{color:"#fff",fontSize:14,fontWeight:800,marginBottom:2,fontFamily:FH,lineHeight:1.3}}>{job.title}</p>
          <p style={{color:MU,fontSize:12}}>{job.co}</p>
        </div>
        <span className="hov" onClick={function(e){e.stopPropagation();props.togSave(job.id);}} style={{fontSize:18,cursor:"pointer",flexShrink:0}}>{props.saved?<FaHeart color="#FF3B80" />:<FaRegHeart />}</span>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
        <span style={pill(job.clr)}>{job.type}</span>
        <span style={pill("#10B981")}>{job.pay}</span>
        {props.applied&&<span style={Object.assign({},pill(PR),{fontSize:10})}><FaCheck /> Applied</span>}
        {job.posted==="Today"&&<span style={Object.assign({},pill(OR),{fontSize:10})}><FaStar /> New</span>}
      </div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{color:MU,fontSize:11}}><FaMapMarker /> {job.loc}</span>
        {d!=null&&<span style={{color:PR,fontSize:11,fontWeight:700}}>{d} mi</span>}
        <span style={{color:MU,fontSize:11}}><FaUsers /> {job.spots||"?"} spot{job.spots!==1?"s":""}</span>
      </div>
    </div>
  );
}

function AppsView(props){
  var sc={accepted:{c:"#10B981",l:"Accepted!",bg:"rgba(16,185,129,0.08)"},pending:{c:WN,l:"Under Review",bg:"rgba(245,158,11,0.08)"},declined:{c:DN,l:"Not Selected",bg:"rgba(239,68,68,0.08)"}};
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:11,marginBottom:18}}>
        {[{icon:<FaCheck />,label:"Accepted",k:"accepted",c:"#10B981"},{icon:<FaHourglassHalf />,label:"Under Review",k:"pending",c:WN},{icon:<FaTimes />,label:"Not Selected",k:"declined",c:DN}].map(function(s){return <div key={s.label} style={bx({textAlign:"center"})}><p style={{fontFamily:FH,fontSize:20,fontWeight:800,color:s.c}}>{props.apps.filter(function(a){return a.status===s.k;}).length}</p><p style={{color:MU,fontSize:11,marginTop:2}}>{s.icon} {s.label}</p></div>;})}
      </div>
      {props.apps.length===0?<div style={bx({textAlign:"center",padding:40})}><p style={{color:MU,fontSize:13,marginBottom:14}}>No applications yet</p><Btn ch="Browse Jobs" onClick={function(){props.setNav("jobs");}}/></div>
      :<div style={{display:"flex",flexDirection:"column",gap:11}}>{props.apps.map(function(app){
        var job=props.jobs.find(function(j){return j.id===app.jobId;});if(!job)return null;
        var s=sc[app.status];
        return <div key={app.id||app.jobId} style={bx({border:"1px solid "+s.c+"33"})}>
          <div style={{display:"flex",gap:12}}>
            <div style={{width:44,height:44,borderRadius:11,background:job.clr+"22",border:"1px solid "+job.clr+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{job.logo}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div><p style={{color:"#fff",fontWeight:800,fontSize:14,fontFamily:FH}}>{job.title}</p><p style={{color:MU,fontSize:12}}>{job.co} - Applied {app.applied}</p></div>
                <div style={{background:s.bg,border:"1px solid "+s.c+"44",borderRadius:9,padding:"7px 12px",textAlign:"center",minWidth:110}}><p style={{color:s.c,fontSize:12,fontWeight:800}}>{s.l}</p></div>
              </div>
              {app.status==="accepted"&&app.iv&&<div style={{marginTop:9,background:"rgba(0,200,150,0.07)",border:"1px solid "+PR+"33",borderRadius:9,padding:"9px 11px"}}><p style={{color:PR,fontWeight:800,fontSize:12,marginBottom:2}}><FaCalendar /> Interview Scheduled!</p><p style={{color:"#6EE7B7",fontSize:12}}>{app.iv.date} at {app.iv.time} - {app.iv.loc}</p></div>}
              {app.status==="accepted"&&!app.iv&&<div style={{marginTop:9,background:"rgba(16,185,129,0.07)",border:"1px solid #10B98133",borderRadius:9,padding:"9px 11px"}}><p style={{color:"#10B981",fontSize:12,fontWeight:800}}><FaCheck /> Accepted! {app.note}</p></div>}
              {app.status==="declined"&&<div style={{marginTop:9,background:"rgba(239,68,68,0.06)",border:"1px solid #EF444433",borderRadius:9,padding:"9px 11px"}}><p style={{color:DN,fontSize:12,fontWeight:800}}>Keep going - most students apply to 5+ jobs. {app.note}</p></div>}
              {app.status==="pending"&&<div style={{marginTop:9,background:"rgba(245,158,11,0.06)",border:"1px solid #F59E0B33",borderRadius:9,padding:"9px 11px"}}><p style={{color:WN,fontSize:12,fontWeight:800}}><FaHourglassHalf /> Under review - typically 3 to 5 business days</p></div>}
            </div>
          </div>
        </div>;
      })}</div>}
    </div>
  );
}

function StudentIVView(props){
  var ivApps=props.apps.filter(function(a){return a.iv;});
  if(ivApps.length===0)return <div style={bx({textAlign:"center",padding:40})}><p style={{fontSize:36,marginBottom:12}}><FaCalendar size={36} /></p><p style={{color:"#fff",fontWeight:700,marginBottom:6}}>No interviews scheduled yet</p><p style={{color:MU,fontSize:13}}>Once an employer schedules an interview it will appear here.</p></div>;
  return(
    <div style={{maxWidth:700}}>
      <div style={bx({background:"rgba(0,200,150,0.07)",borderColor:PR+"33",marginBottom:16,borderRadius:14})}><p style={{color:PR,fontWeight:800,fontSize:14,marginBottom:3}}><FaCheck /> You have {ivApps.length} interview{ivApps.length>1?"s":""} scheduled!</p><p style={{color:"#6EE7B7",fontSize:12}}>Prepare using Career Tools. Arrive 10 min early and bring your resume.</p></div>
      <div style={{display:"flex",flexDirection:"column",gap:13}}>{ivApps.map(function(app){
        var job=props.jobs.find(function(j){return j.id===app.jobId;});if(!job)return null;var iv=app.iv;
        return <div key={app.id||app.jobId} style={bx({border:"1px solid "+PR+"44"})}>
          <div style={{display:"flex",gap:12}}>
            <div style={{width:46,height:46,borderRadius:12,background:job.clr+"22",border:"1px solid "+job.clr+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{job.logo}</div>
            <div style={{flex:1}}>
              <p style={{color:"#fff",fontWeight:800,fontSize:14,fontFamily:FH,marginBottom:2}}>{job.title}</p>
              <p style={{color:MU,fontSize:12,marginBottom:11}}>{job.co}</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9,marginBottom:10}}>
                {[[<FaCalendar size={16} />,"Date",iv.date],[<FaClock size={16} />,"Time",iv.time],[<FaMapMarker size={16} />,"Location",iv.loc]].map(function(row){return <div key={row[1]} style={{background:BG,borderRadius:9,padding:"9px 11px",border:"1px solid "+BR}}><p style={{fontSize:16,marginBottom:3}}>{row[0]}</p><p style={{color:MU,fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:1}}>{row[1].toUpperCase()}</p><p style={{color:"#fff",fontSize:11,fontWeight:700}}>{row[2]}</p></div>;}) }
              </div>
              {iv.notes&&<div style={{background:PR+"0A",border:"1px solid "+PR+"22",borderRadius:9,padding:"9px 11px",marginBottom:9}}><p style={{color:PR,fontSize:11,fontWeight:800,marginBottom:3}}><FaStickyNote /> From Employer</p><p style={{color:"#D1FAE5",fontSize:12,lineHeight:1.6}}>{iv.notes}</p></div>}
              <div style={{background:"rgba(245,158,11,0.07)",border:"1px solid "+WN+"33",borderRadius:9,padding:"9px 11px"}}><p style={{color:WN,fontSize:12,lineHeight:1.6}}><FaLightbulb /> Tip: Research the company, dress professionally, bring your resume, and arrive 10 min early.</p></div>
            </div>
          </div>
        </div>;
      })}</div>
    </div>
  );
}

function ToolsView(props){
  var IQ=[{q:"Tell me about yourself.",a:"Under 60 seconds: your school, a strength, and why you want this role."},{q:"Why do you want this job?",a:"Be specific - reference something real about the company or role."},{q:"What are your strengths?",a:"Pick 2 with a small example each. Show, do not just tell."},{q:"What is a weakness?",a:"Name a real one, then show you are actively working on it."},{q:"How do you handle a difficult customer?",a:"Use LAST: Listen, Acknowledge, Solve, Thank."},{q:"Do you have questions for us?",a:"Always yes! Ask: What does success look like in the first month?"}];
  var W=[{t:"Punctuality",b:"Arrive 5-10 min early. Text if late. One no-call no-show can end a job."},{t:"Dress Code",b:"When in doubt, dress one level above what is required."},{t:"Phone Policy",b:"Keep your phone in your pocket during your shift."},{t:"Communication",b:"Ask questions - it is a strength. Never say that is not my job."},{t:"Teamwork",b:"Help teammates without being asked. This gets you noticed and promoted."},{t:"Paychecks and Taxes",b:"Taxes are withheld from your check. Keep stubs and file taxes every spring."}];
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
        {[{id:"iv",l:<><FaMicrophone /> Interview Prep</>},{id:"w101",l:<><FaBriefcase /> Work 101</>},{id:"stories",l:<><FaTrophy /> Success Stories</>}].map(function(t){return <Btn key={t.id} ch={t.l} v={props.tab===t.id?"pr":"gh"} onClick={function(){props.setTab(t.id);}}/>;}) }
      </div>
      {props.tab==="iv"&&<div style={{maxWidth:680}}>{IQ.map(function(item,i){return <div key={i} className="jc" onClick={function(){props.setOq(props.oq===i?null:i);}} style={bx({marginBottom:9,border:"1px solid "+(props.oq===i?PR+"55":BR)})}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{width:20,height:20,borderRadius:6,background:PR+"22",border:"1px solid "+PR+"44",display:"flex",alignItems:"center",justifyContent:"center",color:PR,fontSize:9,fontWeight:800,flexShrink:0}}>Q{i+1}</span><p style={{color:"#fff",fontWeight:700,fontSize:13}}>{item.q}</p></div><span style={{color:MU,fontSize:16}}>{props.oq===i?"v":">"}</span></div>{props.oq===i&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+BR}}><p style={{color:"#D1FAE5",fontSize:12,lineHeight:1.7,background:PR+"0A",borderRadius:8,padding:10}}><strong style={{color:PR}}>Strategy: </strong>{item.a}</p></div>}</div>;})} </div>}
      {props.tab==="w101"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>{W.map(function(item,i){return <div key={i} style={bx()}><p style={{color:"#fff",fontWeight:800,fontSize:13,fontFamily:FH,marginBottom:6}}>{item.t}</p><p style={{color:MU,fontSize:12,lineHeight:1.7}}>{item.b}</p></div>;})} </div>}
      {props.tab==="stories"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:12}}>{[{n:"Maya R.",age:16,j:"Barista at Houndstooth",c:"#F59E0B",q:"Zero experience and so nervous. Interview prep helped me get the job first try!",t:"Practice answers out loud the night before."},{n:"Carlos M.",age:19,j:"IT Intern at AT&T",c:"#3B82F6",q:"I thought internships were only for people with connections. This proved me wrong.",t:"School projects count as real experience."},{n:"Priya S.",age:17,j:"Youth Coach at YMCA",c:"#10B981",q:"They trained me, and now I lead a soccer team every Saturday. Best thing I have done.",t:"Apply to jobs that offer training."}].map(function(s,i){return <div key={i} style={bx({border:"1px solid "+s.c+"33"})}><div style={{display:"flex",gap:10,alignItems:"center",marginBottom:11}}><div style={{width:38,height:38,borderRadius:11,background:s.c+"22",border:"1px solid "+s.c+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}><FaGraduationCap /></div><div><p style={{color:"#fff",fontWeight:800,fontSize:13}}>{s.n}</p><p style={{color:MU,fontSize:11}}>Age {s.age} - {s.j}</p></div></div><p style={{color:"#D1D5DB",fontSize:12,lineHeight:1.7,fontStyle:"italic",marginBottom:9}}>"{s.q}"</p><div style={{background:s.c+"11",border:"1px solid "+s.c+"33",borderRadius:8,padding:"8px 11px"}}><p style={{color:s.c,fontSize:11,fontWeight:800}}>Tip: {s.t}</p></div></div>;})} </div>}
    </div>
  );
}

function StudentResumePage(props){
  function addSkill(){if(props.nsk.trim()&&!props.rd.skills.includes(props.nsk.trim())){props.setRd(function(p){return Object.assign({},p,{skills:p.skills.concat([props.nsk.trim()])});});props.setNsk("");}}
  async function handleUpload(e){
    var f=e.target.files[0];if(!f)return;
    if(!f.type.includes("pdf")&&!f.name.endsWith(".docx")){props.show("PDF or Word only","err");return;}
    if(sb&&props.user){
      var res=await dbUploadResume(props.user.uid,f);
      if(res.error){props.show("Upload failed: "+res.error,"err");return;}
      // Save the resume URL to database
      const updateRes = await sb.from("students").update({ resume_url: res.url }).eq("id", props.user.uid);
      if(updateRes.error){props.show("Failed to save resume URL: "+updateRes.error.message,"err");return;}
    }
    props.setResume({name:f.name,size:(f.size/1024).toFixed(0)+"KB", url: res?.url});
    props.show("Resume uploaded! Success");
  }
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
        {[{id:"upload",l:<><FaUpload /> Upload</>},{id:"builder",l:<><FaWrench /> Resume Builder</>},{id:"templates",l:<><FaPalette /> Templates</>},{id:"example",l:<><FaFileAlt /> Example</>}].map(function(t){return <Btn key={t.id} ch={t.l} v={props.tab===t.id?"pr":"gh"} onClick={function(){props.setTab(t.id);}}/>;}) }
      </div>
      {props.tab==="upload"&&<div style={{maxWidth:480}}>
        <div className="hov" onClick={function(){props.fileRef.current.click();}} style={{border:"2px dashed "+(props.resume?PR:BR),borderRadius:16,padding:"28px 22px",textAlign:"center",background:props.resume?"rgba(0,200,150,0.05)":CD,marginBottom:14,cursor:"pointer"}}>
          <input ref={props.fileRef} type="file" accept=".pdf,.docx" onChange={handleUpload} style={{display:"none"}}/>
          {props.resume?<div><p style={{fontSize:32,marginBottom:8}}><FaCheck /></p><p style={{color:PR,fontSize:14,fontWeight:800}}>{props.resume.name}</p><p style={{color:MU,fontSize:12}}>{props.resume.size} - Click to replace</p></div>:<div><p style={{fontSize:32,marginBottom:8}}><FaUpload /></p><p style={{color:"#fff",fontSize:14,fontWeight:800,marginBottom:3}}>Upload Your Resume</p><p style={{color:MU,fontSize:12}}>PDF or Word (.docx)</p></div>}
        </div>
        {!props.resume&&<div style={bx({textAlign:"center"})}><p style={{color:MU,fontSize:13,marginBottom:11}}>Do not have one yet?</p><div style={{display:"flex",gap:9,justifyContent:"center"}}><Btn ch="Build One" onClick={function(){props.setTab("builder");}}/><Btn ch="See Example" v="gh" onClick={function(){props.setTab("example");}}/></div></div>}
        {props.resume&&<div style={bx({display:"flex",justifyContent:"space-between",alignItems:"center"})}><p style={{color:PR,fontWeight:800}}>Resume on file - ready to apply!</p><div style={{display:"flex",gap:8}}><Btn ch="View Resume" v="gh" sm onClick={function(){window.open(props.resume.url,'_blank');}}/><Btn ch="Remove" v="gh" sm onClick={async function(){props.setResume(null);if(sb&&props.user){const res=await sb.from("students").update({resume_url:null}).eq("id",props.user.uid);if(res.error)props.show("Failed to remove: "+res.error.message,"err");else props.show("Removed","info");}else props.show("Removed","info");}}/></div></div>}
      </div>}
      {props.tab==="templates"&&<div style={{maxWidth:600}}>
        <p style={{color:MU,fontSize:13,marginBottom:14}}>Pick a style, then customize in Builder.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
          {[{id:"modern",name:"Modern Edge",c:"#00C896"},{id:"classic",name:"Classic Pro",c:"#2563EB"},{id:"bold",name:"Bold and Bright",c:"#F59E0B"}].map(function(t){return <div key={t.id} onClick={function(){props.setTmpl(t.id);}} style={{background:CD,border:"1px solid "+(props.tmpl===t.id?t.c:BR),borderRadius:15,overflow:"hidden",cursor:"pointer",padding:"20px 14px 14px",textAlign:"center"}}><div style={{width:40,height:40,borderRadius:10,background:t.c+"22",border:"1px solid "+t.c+"44",margin:"0 auto 10px",display:"flex",alignItems:"center",justifyContent:"center",color:t.c,fontWeight:800}}>{t.name.slice(0,1)}</div><p style={{color:"#fff",fontWeight:800,fontSize:12,marginBottom:4}}>{t.name}</p>{props.tmpl===t.id&&<span style={pill(t.c)}>Selected</span>}</div>;})}
        </div>
        <Btn ch="Customize in Builder" onClick={function(){props.setTab("builder");}}/>
      </div>}
      {props.tab==="example"&&<div>
        <div style={bx({marginBottom:18,borderColor:PR+"33"})}><h3 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff",marginBottom:6}}><FaClipboard /> Example Resume: Morgan Taylor - Senior at Jesuit College Prep</h3><p style={{color:MU,fontSize:12,lineHeight:1.6,marginBottom:11}}>Every bullet starts with a verb, uses numbers, and fits on one page.</p><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{[["Clear objective",PR],["Numbers in bullets",OR],["Action verbs","#8B5CF6"],["One page","#10B981"]].map(function(pair){return <span key={pair[0]} style={pill(pair[1])}>{pair[0]}</span>;})}</div></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div>{[{t:"Specific objective",d:"Names a goal, school, and timeline."},{t:"Numbers everywhere",d:"25 campers, C to A - data shows impact."},{t:"Action verbs",d:"Led, Operated - never responsible for."},{t:"One page only",d:"Short and tight beats long every time."}].map(function(tip,i){return <div key={i} style={{display:"flex",gap:10,marginBottom:12}}><div style={{width:28,height:28,borderRadius:8,background:PR+"22",border:"1px solid "+PR+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,color:PR,fontWeight:800}}>{i+1}</div><div><p style={{color:"#fff",fontWeight:700,fontSize:12,marginBottom:2}}>{tip.t}</p><p style={{color:MU,fontSize:12,lineHeight:1.6}}>{tip.d}</p></div></div>;})}
          <Btn ch="Build My Resume" onClick={function(){props.setTab("builder");}}/></div>
          <ResumeCard data={EX_DATA} tid="classic"/>
        </div>
      </div>}
      {props.tab==="builder"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,alignItems:"start"}}>
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:9}}>{[["firstName","First Name"],["lastName","Last Name"]].map(function(pair){return <div key={pair[0]}><Lbl t={pair[1].toUpperCase()}/><Inp v={props.rd[pair[0]]} onChange={function(e){var val=e.target.value;props.setRd(function(p){return Object.assign({},p,{[pair[0]]:val});});}}/></div>;})}</div>
          {[["email","Email"],["phone","Phone"],["school","School"],["grade","Grade/Year"],["gpa","GPA (optional)"]].map(function(pair){return <div key={pair[0]} style={{marginBottom:9}}><Lbl t={pair[1].toUpperCase()}/><Inp v={props.rd[pair[0]]} onChange={function(e){var val=e.target.value;props.setRd(function(p){return Object.assign({},p,{[pair[0]]:val});});}}/></div>;})}
          <div style={{marginBottom:9}}><Lbl t="SUMMARY"/><Txa v={props.rd.summary} onChange={function(e){var val=e.target.value;props.setRd(function(p){return Object.assign({},p,{summary:val});});}} h={64}/></div>
          <div style={{marginBottom:9}}>
            <Lbl t="SKILLS"/>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>{props.rd.skills.map(function(sk){return <span key={sk} style={Object.assign({},pill(PR),{cursor:"pointer"})} onClick={function(){props.setRd(function(p){return Object.assign({},p,{skills:p.skills.filter(function(x){return x!==sk;})});});}}>{sk} x</span>;})}</div>
            <div style={{display:"flex",gap:7,marginBottom:7}}><Inp v={props.nsk} onChange={function(e){props.setNsk(e.target.value);}} ph="Type a skill..." sx={{flex:1}}/><Btn ch="Add" sm onClick={addSkill}/></div>
            <p style={{color:MU,fontSize:11,marginBottom:5}}>Click to add:</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{PRESET_SKILLS.filter(function(sk){return !props.rd.skills.includes(sk);}).slice(0,16).map(function(sk){return <span key={sk} className="ni" onClick={function(){props.setRd(function(p){return Object.assign({},p,{skills:p.skills.concat([sk])});});}} style={{background:"rgba(255,255,255,0.05)",border:"1px solid "+BR,borderRadius:7,padding:"3px 9px",fontSize:11,color:MU,cursor:"pointer"}}>+ {sk}</span>;})}</div>
          </div>
          <div style={{marginBottom:9}}><Lbl t="ACTIVITIES (one per line)"/><Txa v={props.rd.activities.join("\n")} onChange={function(e){var val=e.target.value;props.setRd(function(p){return Object.assign({},p,{activities:val.split("\n")});});}} h={56}/></div>
          <div style={{marginBottom:14}}>
            <Lbl t="EXPERIENCE"/>
            {props.rd.experience.map(function(ex,i){return <div key={i} style={{background:BG,borderRadius:8,padding:9,marginBottom:7,border:"1px solid "+BR}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}><input value={ex.role} onChange={function(e){var val=e.target.value;props.setRd(function(p){var a=p.experience.slice();a[i]=Object.assign({},a[i],{role:val});return Object.assign({},p,{experience:a});});}} placeholder="Role" style={Object.assign({},INP,{fontSize:12,padding:"7px 10px"})}/><input value={ex.org} onChange={function(e){var val=e.target.value;props.setRd(function(p){var a=p.experience.slice();a[i]=Object.assign({},a[i],{org:val});return Object.assign({},p,{experience:a});});}} placeholder="Organization" style={Object.assign({},INP,{fontSize:12,padding:"7px 10px"})}/></div>
              <input value={ex.dates} onChange={function(e){var val=e.target.value;props.setRd(function(p){var a=p.experience.slice();a[i]=Object.assign({},a[i],{dates:val});return Object.assign({},p,{experience:a});});}} placeholder="Dates" style={Object.assign({},INP,{fontSize:12,padding:"7px 10px",marginBottom:6})}/>
              <textarea value={ex.desc} onChange={function(e){var val=e.target.value;props.setRd(function(p){var a=p.experience.slice();a[i]=Object.assign({},a[i],{desc:val});return Object.assign({},p,{experience:a});});}} placeholder="Describe your role..." style={Object.assign({},INP,{height:46,fontSize:12,padding:"7px 10px"})}/>
            </div>;})}
            <Btn ch="+ Add Experience" v="gh" sm onClick={function(){props.setRd(function(p){return Object.assign({},p,{experience:p.experience.concat([{role:"",org:"",dates:"",desc:""}])});});}}/>
          </div>
          <Btn ch="Save and Use This Resume" lg sx={{width:"100%",justifyContent:"center"}} onClick={async function(){
            if(sb&&props.user){
              await dbSaveProfile(props.user.uid, props.rd);
              await dbSaveResumeData(props.user.uid, props.rd);
              props.show("Resume data saved!");
            }
            props.setResume({name:props.rd.firstName+"_"+props.rd.lastName+"_Resume.pdf",size:"42KB"});
            props.show("Resume saved! You can now apply.");
            props.setTab("upload");
          }}/>
        </div>
        <div style={{position:"sticky",top:0}}><p style={{color:"#fff",fontWeight:700,fontSize:14,marginBottom:12}}>Live Preview</p><ResumeCard data={props.rd} tid={props.tmpl}/></div>
      </div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BUSINESS APP
// ─────────────────────────────────────────────────────────────
function BizApp(props){
  var [nav,setNav]=useState("overview");
  var [applicants,setApplicants]=useState(LOCAL_APPLICANTS);
  var [fj,setFj]=useState("all");
  var [selA,setSelA]=useState(null);
  var [showRes,setShowRes]=useState(false);
  var [showIV,setShowIV]=useState(false);
  var [ivDraft,setIvDraft]=useState({date:"",time:"",loc:"",notes:""});
  var [showAdd,setShowAdd]=useState(false);
  var [myJobs,setMyJobs]=useState(LOCAL_JOBS.filter(function(j){return BIZ_IDS.includes(j.id);}));
  var [nj,setNj]=useState({title:"",type:"Part-Time",pay:"",loc:"",sched:"",train:"",desc:"",qs:[""]});
  var [biz,setBiz]=useState({co:props.user?props.user.name:"Houndstooth Coffee",nm:"Sarah Mitchell",email:"sarah@houndstooth.com",phone:"(214) 555-3377",addr:"2817 Commerce St, Dallas TX",web:"houndstoothcoffee.com",ind:"Food and Beverage",size:"11-50 employees",about:"Specialty coffee shop committed to quality and community. We love giving first-time workers their start."});
  var [editB,setEditB]=useState(false);
  var [bd,setBd]=useState(Object.assign({},biz));

  // Load real data from Supabase when connected
  useEffect(function(){
    if(!sb||!props.user)return;
    dbLoadMyJobs(props.user.uid).then(function(data){if(data&&data.length)setMyJobs(data);});
    dbLoadApplicants(props.user.uid).then(function(data){if(data)setApplicants(data);});
  },[props.user]);

  async function updStatus(id,st){
    if(sb){var res=await dbUpdateAppStatus(id,st);if(res.error){props.show("Error: "+res.error,"err");return;}}
    setApplicants(function(p){return p.map(function(a){return a.id===id?Object.assign({},a,{status:st}):a;});});
    setSelA(function(p){return p&&p.id===id?Object.assign({},p,{status:st}):p;});
    props.show(st==="accepted"?"Accepted!":st==="declined"?"Declined":"Moved to pending","info");
  }

  async function schedIV(){
    if(!ivDraft.date||!ivDraft.time||!ivDraft.loc){props.show("Fill in date, time, and location","err");return;}
    if(sb&&selA){await dbScheduleInterview(selA.id,{interview_date:ivDraft.date,interview_time:ivDraft.time,location:ivDraft.loc,notes:ivDraft.notes});}
    setApplicants(function(p){return p.map(function(a){return a.id===selA.id?Object.assign({},a,{iv:Object.assign({},ivDraft)}):a;});});
    setSelA(function(p){return Object.assign({},p,{iv:Object.assign({},ivDraft)});});
    setShowIV(false);props.show("Interview scheduled! Scheduled");
  }

  async function addJob(){
    if(!nj.title||!nj.pay){props.show("Title and pay required","err");return;}
    var jobData={title:nj.title,type:nj.type,pay:nj.pay,location:nj.loc,schedule:nj.sched,training:nj.train,description:nj.desc,questions:nj.qs.filter(function(q){return q.trim();}),spots:1,tags:[],is_active:true};
    if(sb&&props.user){var res=await dbPostJob(props.user.uid,jobData);if(res.error){props.show("Error: "+res.error,"err");return;}}
    var localJob=Object.assign({},jobData,{id:Date.now(),co:biz.co,logo:<FaStar />,clr:"#F59E0B",loc:nj.loc,la:32.793,lo:-96.807,posted:"Today",qs:nj.qs.filter(function(q){return q.trim();})});
    setMyJobs(function(p){return p.concat([localJob]);});
    setShowAdd(false);setNj({title:"",type:"Part-Time",pay:"",loc:"",sched:"",train:"",desc:"",qs:[""]});
    props.show("Job posted! Success");
  }

  var pend=applicants.filter(function(a){return a.status==="pending";}).length;
  var scheduledIVs=applicants.filter(function(a){return a.iv;});
  var disp=fj==="all"?applicants:applicants.filter(function(a){return a.jobId===parseInt(fj)||a.job_id===fj;});

  var navItems=[
    {id:"overview",ic:<FaChartLine />,lb:"Overview"},
    {id:"jobs",ic:<FaClipboard />,lb:"My Job Posts"},
    {id:"applicants",ic:<FaUsers />,lb:"Applicants",b:pend||null},
    {id:"interviews",ic:<FaCalendar />,lb:"Interviews",b:scheduledIVs.length||null,bc:PR},
    {id:"profile",ic:<FaBuilding />,lb:"Business Profile"},
  ];

  return(
    <div style={{display:"flex",minHeight:"100vh"}}>
      <Sidebar items={navItems} cur={nav} set={setNav} ac={OR} onLogout={props.logout}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{background:SF,borderBottom:"1px solid "+BR,padding:"11px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
          <div>
            <h1 style={{fontFamily:FH,fontSize:17,fontWeight:800,color:"#fff",display:"flex",alignItems:"center",gap:8}}>
              {navItems.find(function(x){return x.id===nav;}).ic} {navItems.find(function(x){return x.id===nav;}).lb}
            </h1>
            <p style={{color:MU,fontSize:11}}>{biz.co} - Employer Dashboard</p>
          </div>
          <div style={{display:"flex",gap:9,alignItems:"center"}}>
            <Btn ch="+ Post New Job" v="or" sm sx={{background:OR,color:"#000"}} onClick={function(){setShowAdd(true);}}/>
            <span style={pill(OR)}><FaBriefcase style={{marginRight:4}}/> Employer</span>
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"20px 22px"}}>

          {nav==="overview"&&<div>
            <p style={{color:MU,fontSize:13,marginBottom:16}}>Your hiring activity on LaunchDFW.</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:11,marginBottom:20}}>
              {[{n:myJobs.length,l:<><FaClipboard /> Listings</>,c:OR},{n:applicants.length,l:<><FaUsers /> Applicants</>,c:BL},{n:pend,l:<><FaHourglassHalf /> Pending</>,c:WN},{n:applicants.filter(function(a){return a.status==="accepted";}).length,l:<><FaCheck /> Accepted</>,c:"#10B981"}].map(function(s){return <div key={s.l} style={bx({textAlign:"center"})}><p style={{fontFamily:FH,fontSize:22,fontWeight:800,color:s.c}}>{s.n}</p><p style={{color:MU,fontSize:11,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>{s.l}</p></div>;})}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={bx()}><h3 style={{fontFamily:FH,fontSize:13,fontWeight:700,color:"#fff",marginBottom:11,display:"flex",alignItems:"center",gap:6}}><FaUsers /> Recent Applicants</h3>
                {applicants.slice(0,5).map(function(a){var j=myJobs.find(function(x){return x.id===a.jobId||x.id===a.job_id;});return <div key={a.id} className="ni" onClick={function(){setSelA(a);setNav("applicants");}} style={{display:"flex",gap:9,alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+BR,cursor:"pointer"}}><div style={{width:30,height:30,borderRadius:8,background:OR+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}><FaUser /></div><div style={{flex:1}}><p style={{color:"#fff",fontWeight:700,fontSize:12}}>{a.name}</p><p style={{color:MU,fontSize:11}}>{j?j.title:""}</p></div><span style={pill(a.status==="pending"?WN:a.status==="accepted"?"#10B981":DN)}>{a.status}</span></div>;})}
              </div>
              <div style={bx()}><h3 style={{fontFamily:FH,fontSize:13,fontWeight:700,color:"#fff",marginBottom:11,display:"flex",alignItems:"center",gap:6}}><FaClipboard /> Your Listings</h3>
                {myJobs.map(function(j){var cnt=applicants.filter(function(a){return a.jobId===j.id||a.job_id===j.id;}).length;return <div key={j.id} style={{display:"flex",gap:9,alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+BR}}><div style={{width:30,height:30,borderRadius:8,background:j.clr+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{j.logo}</div><div style={{flex:1}}><p style={{color:"#fff",fontWeight:700,fontSize:12}}>{j.title}</p><p style={{color:MU,fontSize:11}}>{cnt} applicant{cnt!==1?"s":""}</p></div><span style={pill(OR)}>{j.type}</span></div>;})}
              </div>
            </div>
          </div>}

          {nav==="jobs"&&<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><p style={{color:MU,fontSize:13}}>{myJobs.length} listings for {biz.co}</p><Btn ch="+ Post New Job" v="or" sx={{background:OR,color:"#000"}} onClick={function(){setShowAdd(true);}}/></div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>{myJobs.map(function(j){
              var a2=applicants.filter(function(a){return a.jobId===j.id||a.job_id===j.id;});
              return <div key={j.id} style={bx({border:"1px solid "+j.clr+"33"})}>
                <div style={{display:"flex",gap:12}}>
                  <div style={{width:46,height:46,borderRadius:11,background:j.clr+"22",border:"1px solid "+j.clr+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{j.logo}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:6}}><div><h3 style={{fontFamily:FH,fontSize:14,fontWeight:800,color:"#fff",marginBottom:1}}>{j.title}</h3><p style={{color:MU,fontSize:12}}>{j.loc||j.location} - {j.sched||j.schedule}</p></div><div style={{display:"flex",gap:6}}><span style={pill(j.clr)}>{j.type}</span><span style={pill("#10B981")}>{j.pay}</span></div></div>
                    {j.qs&&j.qs.length>0&&<div style={{marginBottom:9}}><p style={{color:MU,fontSize:11,fontWeight:700,marginBottom:5}}>Custom Questions: {j.qs.length}</p><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{j.qs.map(function(q2,i){return <span key={i} style={pill(BL,"rgba(59,130,246,0.08)")} title={q2}>Q{i+1}: {q2.length>36?q2.slice(0,36)+"...":q2}</span>;})}</div></div>}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                      {[{l:"Applied",n:a2.length,c:BL},{l:"Pending",n:a2.filter(function(a){return a.status==="pending";}).length,c:WN},{l:"Open",n:j.spots||1,c:OR}].map(function(s){return <div key={s.l} style={{background:BG,borderRadius:9,padding:"8px 11px",border:"1px solid "+BR}}><p style={{color:s.c,fontFamily:FH,fontSize:18,fontWeight:800}}>{s.n}</p><p style={{color:MU,fontSize:11}}>{s.l}</p></div>;})}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:11,borderTop:"1px solid "+BR,paddingTop:11}}><Btn ch={"View Applicants ("+a2.length+")"} sm onClick={function(){setFj(String(j.id));setNav("applicants");}}/></div>
                  </div>
                </div>
              </div>;
            })}</div>
          </div>}

          {nav==="applicants"&&<div>
            <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
              <select value={fj} onChange={function(e){setFj(e.target.value);}} style={Object.assign({},INP,{width:"auto",cursor:"pointer"})}>
                <option value="all">All Jobs ({applicants.length})</option>
                {myJobs.map(function(j){return <option key={j.id} value={String(j.id)}>{j.title} ({applicants.filter(function(a){return a.jobId===j.id||a.job_id===j.id;}).length})</option>;})}
              </select>
              <div style={{display:"flex",gap:6}}>{[{s:"pending",c:WN},{s:"accepted",c:"#10B981"},{s:"declined",c:DN}].map(function(x){return <span key={x.s} style={pill(x.c)}>{x.s} ({applicants.filter(function(a){return a.status===x.s;}).length})</span>;})}</div>
            </div>
            {disp.length===0&&<p style={{color:MU,textAlign:"center",padding:"30px 0"}}>No applicants yet.</p>}
            <div style={{display:"flex",flexDirection:"column",gap:9}}>{disp.map(function(a){
              var j=myJobs.find(function(x){return x.id===a.jobId||x.id===a.job_id;});
              var isSel=selA&&selA.id===a.id;
              var scol=a.status==="pending"?WN:a.status==="accepted"?"#10B981":DN;
              return <div key={a.id} className="jc" onClick={function(){setSelA(isSel?null:a);}} style={bx({border:"1px solid "+(isSel?OR+"66":BR)})}>
                <div style={{display:"flex",gap:11}}>
                  <div style={{width:42,height:42,borderRadius:11,background:OR+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0}}><FaUser /></div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                      <div><p style={{color:"#fff",fontWeight:800,fontSize:13,fontFamily:FH}}>{a.name}</p><p style={{color:MU,fontSize:12}}>{a.school} - {a.grade} - Age {a.age}</p></div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>{a.iv&&<span style={pill(PR)}><FaCalendar style={{marginRight:4}}/> Interview Set</span>}<span style={pill(scol)}>{a.status}</span></div>
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:5,flexWrap:"wrap"}}><span style={{color:MU,fontSize:11}}>{j?j.title:""}</span><span style={{color:MU,fontSize:11}}>Applied: {a.applied}</span><span style={{color:MU,fontSize:11}}>{a.email}</span></div>
                    {a.note&&<p style={{color:"#ccc",fontSize:12,marginTop:7,padding:"7px 10px",background:BG,borderRadius:7}}>"{a.note}"</p>}
                  </div>
                </div>
                {isSel&&<div style={{marginTop:11,paddingTop:11,borderTop:"1px solid "+BR}}>
                  {a.ans&&Object.keys(a.ans).length>0&&<div style={bx({background:BG,marginBottom:10})}><p style={{color:BL,fontSize:11,fontWeight:800,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><FaStickyNote /> Applicant Answers</p>{Object.entries(a.ans).map(function(entry){return <div key={entry[0]} style={{marginBottom:8}}><p style={{color:MU,fontSize:11,fontWeight:700,marginBottom:2}}>{entry[0]}</p><p style={{color:"#D1D5DB",fontSize:12,lineHeight:1.6}}>{entry[1]}</p></div>;})}</div>}
                  <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                    <Btn ch={<><FaFileAlt style={{marginRight:4}}/> View Resume</>} v="gh" sm onClick={function(e){e.stopPropagation();setShowRes(true);}}/>
                    {a.status!=="accepted"&&<Btn ch="Accept" sm onClick={function(e){e.stopPropagation();updStatus(a.id,"accepted");}}/>}
                    {a.status!=="declined"&&<Btn ch="Decline" v="dn" sm onClick={function(e){e.stopPropagation();updStatus(a.id,"declined");}}/>}
                    {a.status!=="pending"&&<Btn ch="Move to Pending" v="gh" sm onClick={function(e){e.stopPropagation();updStatus(a.id,"pending");}}/>}
                    {a.status==="accepted"&&<Btn ch={<><FaCalendar style={{marginRight:4}}/>{a.iv?"Edit Interview":"Schedule Interview"}</>} v="gh" sm sx={{background:PR+"22",color:PR,border:"1px solid "+PR+"44"}} onClick={function(e){e.stopPropagation();setShowIV(true);setIvDraft(a.iv||{date:"",time:"",loc:"",notes:""}); }}/>}
                  </div>
                </div>}
              </div>;
            })}</div>
          </div>}

          {nav==="interviews"&&<BizInterviewsView applicants={applicants} myJobs={myJobs}/>}

          {nav==="profile"&&<div style={{maxWidth:680}}>
            <div style={bx({marginBottom:14,display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"})}>
              <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,"+OR+",#FF3B80)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}><FaBuilding /></div>
              <div style={{flex:1}}><h2 style={{fontFamily:FH,fontSize:18,fontWeight:800,color:"#fff",marginBottom:2}}>{biz.co}</h2><p style={{color:MU,fontSize:12}}>{biz.ind} - {biz.size}</p><p style={{color:MU,fontSize:12,marginTop:2}}>{biz.about}</p></div>
              <Btn ch={editB?"Cancel":"Edit Profile"} v={editB?"gh":"or"} sx={editB?{}:{background:OR,color:"#000"}} onClick={function(){setBd(Object.assign({},biz));setEditB(!editB);}}/>
            </div>
            {editB?<div style={bx()}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>{[["co","Company Name"],["nm","Your Name"],["email","Email"],["phone","Phone"],["addr","Address"],["web","Website"],["ind","Industry"],["size","Company Size"]].map(function(pair){return <div key={pair[0]}><Lbl t={pair[1].toUpperCase()}/><Inp v={bd[pair[0]]} onChange={function(e){var val=e.target.value;setBd(function(p){return Object.assign({},p,{[pair[0]]:val});});}}/></div>;})}</div>
              <div style={{marginBottom:14}}><Lbl t="ABOUT"/><Txa v={bd.about} onChange={function(e){var val=e.target.value;setBd(function(p){return Object.assign({},p,{about:val});});}} h={68}/></div>
              <div style={{display:"flex",gap:8}}><Btn ch="Save Changes" lg sx={{background:OR,color:"#000"}} onClick={function(){setBiz(Object.assign({},bd));setEditB(false);props.show("Updated! Success");}}/><Btn ch="Cancel" v="gh" onClick={function(){setEditB(false);}}/></div>
            </div>:<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:13}}>
              <div style={bx()}><h3 style={{fontFamily:FH,fontSize:13,fontWeight:700,color:"#fff",marginBottom:11}}>Contact and Details</h3>{[["Company",biz.co],["Contact",biz.nm],["Email",biz.email],["Phone",biz.phone],["Address",biz.addr],["Website",biz.web]].map(function(pair){return <div key={pair[0]} style={{marginBottom:8}}><p style={{color:MU,fontSize:10,fontWeight:700}}>{pair[0]}</p><p style={{color:"#fff",fontSize:12,fontWeight:600}}>{pair[1]}</p></div>;})}</div>
              <div style={bx()}><Lbl t="INDUSTRY"/><p style={{color:"#fff",fontSize:13,fontWeight:600,marginBottom:9}}>{biz.ind}</p><Lbl t="SIZE"/><p style={{color:"#fff",fontSize:13,fontWeight:600,marginBottom:9}}>{biz.size}</p><Lbl t="ABOUT"/><p style={{color:MU,fontSize:12,lineHeight:1.7,marginBottom:12}}>{biz.about}</p><div style={{background:OR+"11",border:"1px solid "+OR+"33",borderRadius:9,padding:"9px 11px"}}><p style={{color:OR,fontSize:11,fontWeight:800,marginBottom:2}}>Verified Employer</p><p style={{color:"#FED7AA",fontSize:11}}>Approved to post on LaunchDFW.</p></div></div>
            </div>}
          </div>}
        </div>
      </div>

      {showRes&&selA&&<Modal onClose={function(){setShowRes(false);}} w={600}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid "+BR,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><p style={{color:OR,fontSize:10,fontWeight:800,marginBottom:2}}>APPLICANT RESUME</p><h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff"}}>{selA.name}</h2></div>
          <Btn ch="Close" v="gh" sm onClick={function(){setShowRes(false);}}/>
        </div>
        <div style={{padding:"14px 18px"}}>
          <div style={bx({background:BG,marginBottom:14})}><div style={{display:"flex",gap:14,flexWrap:"wrap"}}>{[["Name",selA.name],["School",selA.school],["Grade",selA.grade],["Age",selA.age],["Email",selA.email]].map(function(pair){return <div key={pair[0]}><p style={{color:MU,fontSize:10}}>{pair[0]}</p><p style={{color:"#fff",fontSize:12,fontWeight:700}}>{pair[1]}</p></div>;})}</div></div>
          <ResumeCard data={Object.assign({},EX_DATA,{firstName:selA.name.split(" ")[0],lastName:selA.name.split(" ").slice(1).join(" "),school:selA.school,grade:selA.grade,email:selA.email})} tid="classic"/>
        </div>
      </Modal>}

      {showIV&&selA&&<Modal onClose={function(){setShowIV(false);}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid "+BR,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><p style={{color:PR,fontSize:10,fontWeight:800,marginBottom:2}}>SCHEDULE INTERVIEW</p><h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff"}}>{selA.name}</h2></div>
          <Btn ch="X" v="gh" sm onClick={function(){setShowIV(false);}}/>
        </div>
        <div style={{padding:"14px 18px 18px"}}>
          <p style={{color:MU,fontSize:13,marginBottom:14}}>The student will see this in their Interviews tab.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
            <div><Lbl t="DATE"/><Inp v={ivDraft.date} onChange={function(e){var val=e.target.value;setIvDraft(function(p){return Object.assign({},p,{date:val});});}} ph="Apr 15, 2026" tp="date"/></div>
            <div><Lbl t="TIME"/><Inp v={ivDraft.time} onChange={function(e){var val=e.target.value;setIvDraft(function(p){return Object.assign({},p,{time:val});});}} ph="2:00 PM" tp="time"/></div>
          </div>
          <div style={{marginBottom:9}}><Lbl t="LOCATION"/><Inp v={ivDraft.loc} onChange={function(e){var val=e.target.value;setIvDraft(function(p){return Object.assign({},p,{loc:val});});}} ph="e.g. 2817 Commerce St or Video Call"/></div>
          <div style={{marginBottom:14}}><Lbl t="NOTES FOR STUDENT (optional)"/><Txa v={ivDraft.notes} onChange={function(e){var val=e.target.value;setIvDraft(function(p){return Object.assign({},p,{notes:val});});}} ph="e.g. Bring your resume. Arrive 10 min early." h={64}/></div>
          <div style={{display:"flex",gap:8}}><Btn ch="Confirm Interview" lg sx={{flex:1,justifyContent:"center",background:PR,color:"#000"}} onClick={schedIV}/><Btn ch="Cancel" v="gh" onClick={function(){setShowIV(false);}}/></div>
        </div>
      </Modal>}

      {showAdd&&<Modal onClose={function(){setShowAdd(false);}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid "+BR,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><p style={{color:OR,fontSize:10,fontWeight:800,marginBottom:2}}>NEW JOB POST</p><h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff"}}>Post a Job for {biz.co}</h2></div>
          <Btn ch="X" v="gh" sm onClick={function(){setShowAdd(false);}}/>
        </div>
        <div style={{padding:"14px 18px 18px",maxHeight:"70vh",overflowY:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
            <div><Lbl t="JOB TITLE (required)"/><Inp v={nj.title} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{title:val});});}} ph="e.g. Barista Trainee"/></div>
            <div><Lbl t="JOB TYPE"/><select value={nj.type} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{type:val});});}} style={Object.assign({},INP,{cursor:"pointer"})}>{["Part-Time","Internship","Seasonal","Full-Time"].map(function(t){return <option key={t}>{t}</option>;})}</select></div>
            <div><Lbl t="PAY RATE (required)"/><Inp v={nj.pay} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{pay:val});});}} ph="e.g. $13/hr"/></div>
            <div><Lbl t="LOCATION"/><Inp v={nj.loc} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{loc:val});});}} ph="e.g. Uptown Dallas"/></div>
            <div><Lbl t="SCHEDULE"/><Inp v={nj.sched} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{sched:val});});}} ph="e.g. Weekends"/></div>
            <div><Lbl t="TRAINING PROVIDED"/><Inp v={nj.train} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{train:val});});}} ph="e.g. Full training"/></div>
          </div>
          <div style={{marginBottom:12}}><Lbl t="DESCRIPTION (required)"/><Txa v={nj.desc} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{desc:val});});}} ph="Describe the role..." h={72}/></div>
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}><Lbl t="CUSTOM QUESTIONS FOR APPLICANTS"/><Btn ch="+ Add" v="gh" sm onClick={function(){setNj(function(p){return Object.assign({},p,{qs:p.qs.concat([""])});});}}/></div>
            {nj.qs.map(function(q2,i){return <div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}><span style={{width:18,height:18,borderRadius:5,background:BL+"22",border:"1px solid "+BL+"44",display:"flex",alignItems:"center",justifyContent:"center",color:BL,fontSize:9,fontWeight:800,flexShrink:0}}>Q{i+1}</span><Inp v={q2} onChange={function(e){var val=e.target.value;setNj(function(p){var qs2=p.qs.slice();qs2[i]=val;return Object.assign({},p,{qs:qs2});});}} ph={"Question "+(i+1)+"..."} sx={{flex:1}}/>{nj.qs.length>1&&<span className="hov" onClick={function(){setNj(function(p){return Object.assign({},p,{qs:p.qs.filter(function(_,j2){return j2!==i;})});});}} style={{color:DN,fontSize:16,cursor:"pointer",padding:4}}>x</span>}</div>;})}
          </div>
          <div style={{display:"flex",gap:8}}><Btn ch="Post Job Listing" lg sx={{flex:1,justifyContent:"center",background:OR,color:"#000"}} onClick={addJob}/><Btn ch="Cancel" v="gh" onClick={function(){setShowAdd(false);}}/></div>
        </div>
      </Modal>}
    </div>
  );
}

function BizInterviewsView(props){
  var ivApps=props.applicants.filter(function(a){return a.iv;});
  if(ivApps.length===0)return(
    <div style={bx({textAlign:"center",padding:50})}><p style={{fontSize:44,marginBottom:14}}><FaCalendar /></p><p style={{color:"#fff",fontWeight:800,fontSize:16,marginBottom:8}}>No interviews scheduled yet</p><p style={{color:MU,fontSize:13}}>Accept applicants and click Schedule Interview to set them up here.</p></div>
  );
  return(
    <div style={{maxWidth:800}}>
      <div style={bx({background:"rgba(0,200,150,0.07)",borderColor:PR+"33",marginBottom:20,borderRadius:14,display:"flex",alignItems:"center",gap:12})}>
        <p style={{fontSize:28}}><FaCheck /></p>
        <div><p style={{color:PR,fontWeight:800,fontSize:14}}>{ivApps.length} interview{ivApps.length>1?"s":""} scheduled</p><p style={{color:"#6EE7B7",fontSize:12,marginTop:2}}>Students have been notified via in-app message.</p></div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>{ivApps.map(function(app){
        var job=props.myJobs.find(function(j){return j.id===app.jobId||j.id===app.job_id;});var iv=app.iv;
        return <div key={app.id} style={bx({border:"1px solid "+PR+"33"})}>
          <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
            <div style={{width:52,height:52,borderRadius:14,background:"rgba(0,200,150,0.12)",border:"1px solid "+PR+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}><FaUser /></div>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:10}}>
                <div><p style={{color:"#fff",fontWeight:800,fontSize:15,fontFamily:FH}}>{app.name}</p><p style={{color:MU,fontSize:12,marginTop:2}}>{app.school} - {app.grade} - Age {app.age}</p><p style={{color:MU,fontSize:12}}>Applying for: <span style={{color:PR,fontWeight:700}}>{job?job.title:"Unknown"}</span></p></div>
                <span style={pill(PR)}><FaEnvelope style={{marginRight:4}}/> {app.email}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:12}}>
                {[[<FaCalendar />,"Date",iv.date],[<FaClock />,"Time",iv.time],[<FaMapMarker />,"Location",iv.loc]].map(function(row){return <div key={row[1]} style={{background:BG,borderRadius:10,padding:"10px 13px",border:"1px solid "+BR}}><p style={{fontSize:18,marginBottom:4}}>{row[0]}</p><p style={{color:MU,fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:2}}>{row[1].toUpperCase()}</p><p style={{color:"#fff",fontSize:12,fontWeight:700}}>{row[2]}</p></div>;}) }
              </div>
              {iv.notes&&<div style={{background:PR+"0A",border:"1px solid "+PR+"22",borderRadius:10,padding:"10px 13px",marginBottom:10}}><p style={{color:PR,fontSize:11,fontWeight:800,marginBottom:3,display:"flex",alignItems:"center",gap:6}}><FaStickyNote /> Notes sent to applicant</p><p style={{color:"#D1FAE5",fontSize:12,lineHeight:1.6}}>{iv.notes}</p></div>}
              <div style={{display:"flex",gap:8,flexWrap:"wrap",paddingTop:10,borderTop:"1px solid "+BR}}>
                <span style={pill("#10B981")}>Confirmed</span>
                <span style={pill(WN)}><FaCalendar style={{marginRight:4}}/> {iv.date} at {iv.time}</span>
              </div>
            </div>
          </div>
        </div>;
      })}</div>
    </div>
  );
}