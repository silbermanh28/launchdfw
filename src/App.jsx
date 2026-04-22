import { useState, useRef, useEffect } from "react";
import { FaUser, FaEnvelope, FaCheck, FaHeart, FaStar, FaFootballBall, FaPlane, FaMugHot, FaClipboard, FaHourglassHalf, FaTimes, FaCoffee, FaLaptop, FaFutbol, FaCamera, FaBook, FaBuilding, FaShoppingCart, FaPaw, FaSoap, FaUniversity, FaChartLine, FaPen, FaBasketballBall, FaDrumstickBite, FaHospital, FaShoppingBag, FaCar, FaFilm, FaLeaf, FaGraduationCap, FaExclamationTriangle, FaLock, FaDoorOpen, FaArrowLeft, FaHome, FaFileAlt, FaCalendar, FaUsers, FaBriefcase, FaMapMarker, FaQuestion, FaSearch, FaClock, FaStickyNote, FaLightbulb, FaMicrophone, FaTrophy, FaUpload, FaWrench, FaPalette, FaRegHeart, FaBell, FaCommentDots, FaPaperPlane, FaDownload, FaFlag, FaCheckCircle } from "react-icons/fa";
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
  var profileRes = await sb.from("profiles").insert({ id: uid, role: role, email: email, first_name: extra.firstName || "", last_name: extra.lastName || "" });
  if (profileRes.error) return { error: profileRes.error.message };
  if (role === "student") {
    var studentRes = await sb.from("students").insert({
      id: uid,
      email: email,
      phone: extra.phone || "",
      school: extra.school || "",
      grade: extra.grade || "",
      age: extra.age || "",
      bio: extra.bio || "",
      summary: extra.summary || extra.bio || "",
      skills: extra.skills || [],
      activities: extra.activities || [],
      experience: extra.experience || [],
      gpa: extra.gpa || ""
    });
    if (studentRes.error) return { error: studentRes.error.message };
  } else {
    var verificationMeta = getEmployerVerificationMetadata(email, extra.website || "", "pending");
    var employerRes = await sb.from("employers").insert({
      id: uid,
      company_name: extra.company || "",
      contact_name: buildFullName(extra.firstName, extra.lastName),
      email: email,
      phone: extra.phone || "",
      address: extra.address || "",
      website: extra.website || "",
      industry: extra.industry || "",
      company_size: extra.companySize || "",
      about: extra.about || "",
      verification_status: verificationMeta.status,
      email_domain_match: verificationMeta.emailDomainMatch,
      verification_signal: verificationMeta.verificationSignal
    });
    if (employerRes.error) return { error: employerRes.error.message };
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
  var jobs = res.data || [];
  var employerIds = Array.from(new Set(jobs.map(function(job){ return job.employer_id; }).filter(Boolean)));
  var employersById = {};
  if (employerIds.length > 0) {
    var employerRes = await sb.from("employers").select("id,verification_status,email_domain_match,verification_signal").in("id", employerIds);
    if (!employerRes.error && Array.isArray(employerRes.data)) {
      employerRes.data.forEach(function(employer){
        employersById[employer.id] = employer;
      });
    } else if (employerRes.error) {
      console.warn("dbLoadJobs employers error", employerRes.error);
    }
  }
  return jobs.map(function(job){
    var employer = employersById[job.employer_id] || {};
    return Object.assign({}, job, {
      verificationStatus: employer.verification_status || "pending",
      emailDomainMatch: !!employer.email_domain_match,
      verificationSignal: employer.verification_signal || ""
    });
  });
}

async function dbLoadMyApps(studentId) {
  if (!sb) return null;
  var res = await sb.from("applications").select("*, jobs(*), interviews(*)").eq("student_id", studentId);
  if (res.error) return null;
  return res.data;
}

async function dbSubmitApp(jobId, studentId, availability, note, answers) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.from("applications").insert({
    job_id: jobId,
    student_id: studentId,
    availability: Array.isArray(availability) ? availability : [],
    note: note,
    answers: answers || {},
    status: "pending"
  }).select("*").single();
  return res.error ? { error: res.error.message } : { ok: true, data: res.data };
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
  var safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const fileName = `${uid}/${Date.now()}-${safeName}`;
  const { error } = await sb.storage.from('resumes').upload(fileName, file, { upsert: true });
  if (error) return { error: error.message };
  const { data: urlData } = sb.storage.from('resumes').getPublicUrl(fileName);
  return { url: urlData.publicUrl };
}

// Employer functions
async function dbLoadMyJobs(employerId) {
  if (!sb) return null;
  var res = await sb.from("jobs").select("*").eq("employer_id", employerId).eq("is_active", true);
  return res.error ? null : res.data;
}

async function dbPostJob(employerId, job) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.from("jobs").insert(Object.assign({}, job, { employer_id: employerId, is_active: true })).select("*").single();
  return res.error ? { error: res.error.message } : { ok: true, data: res.data };
}

async function dbUpdateJob(employerId, jobId, job) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.from("jobs").update(job).eq("id", jobId).eq("employer_id", employerId);
  return res.error ? { error: res.error.message } : { ok: true };
}

async function dbDeleteJob(employerId, jobId) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.from("jobs").update({ is_active: false }).eq("id", jobId).eq("employer_id", employerId);
  return res.error ? { error: res.error.message } : { ok: true };
}

async function dbLoadEmployerProfile(employerId) {
  if (!sb) return null;
  var profileRes = await sb.from("profiles").select("first_name,last_name,email").eq("id", employerId).maybeSingle();
  var employerRes = await sb.from("employers").select("*").eq("id", employerId).maybeSingle();
  if (profileRes.error && employerRes.error) return null;
  return {
    profile: profileRes.data || {},
    employer: employerRes.data || {}
  };
}

async function dbSaveEmployerProfile(employerId, bizData) {
  if (!sb) return { error: "not_connected" };
  var normalizedBiz = createBusinessProfile(bizData);
  var verificationMeta = getEmployerVerificationMetadata(normalizedBiz.email, normalizedBiz.web, normalizedBiz.verificationStatus);
  var nameParts = splitName(normalizedBiz.nm);
  var profileRes = await sb.from("profiles").update({
    first_name: nameParts.firstName,
    last_name: nameParts.lastName,
    email: normalizedBiz.email
  }).eq("id", employerId);
  if (profileRes.error) return { error: profileRes.error.message };

  var employerRes = await sb.from("employers").update({
    company_name: normalizedBiz.co,
    contact_name: normalizedBiz.nm,
    email: normalizedBiz.email,
    phone: normalizedBiz.phone,
    address: normalizedBiz.addr,
    website: normalizedBiz.web,
    industry: normalizedBiz.ind,
    company_size: normalizedBiz.size,
    about: normalizedBiz.about,
    verification_status: verificationMeta.status,
    email_domain_match: verificationMeta.emailDomainMatch,
    verification_signal: verificationMeta.verificationSignal
  }).eq("id", employerId);
  if (employerRes.error) return { error: employerRes.error.message };
  return { ok: true };
}

async function dbLoadApplicants(employerId) {
  if (!sb) return null;
  var jobsRes = await sb.from("jobs").select("id").eq("employer_id", employerId);
  if (jobsRes.error) {
    console.error("dbLoadApplicants jobs error", jobsRes.error);
    return null;
  }

  var jobIds = (jobsRes.data || []).map(function(j){ return j.id; });
  if (jobIds.length === 0) return [];

  var appsRes = await sb
    .from("applications")
    .select("*")
    .in("job_id", jobIds)
    .order("applied_at", { ascending: false });

  if (appsRes.error) {
    console.error("dbLoadApplicants applications error", appsRes.error);
    return null;
  }

  var apps = appsRes.data || [];
  var appIds = apps.map(function(a){ return a.id; }).filter(Boolean);
  var studentIds = Array.from(new Set(apps.map(function(a){ return a.student_id; }).filter(Boolean)));
  var profilesById = {};
  var studentsById = {};
  var interviewsByAppId = {};

  if (studentIds.length > 0) {
    var studentsRes = await sb.from("students").select("*").in("id", studentIds);
    if (!studentsRes.error && Array.isArray(studentsRes.data)) {
      studentsRes.data.forEach(function(student){
        studentsById[student.id] = student;
      });
    } else if (studentsRes.error) {
      console.warn("dbLoadApplicants students error", studentsRes.error);
    }

    var profilesRes = await sb.from("profiles").select("id, first_name, last_name").in("id", studentIds);
    if (!profilesRes.error && Array.isArray(profilesRes.data)) {
      profilesRes.data.forEach(function(profile){
        profilesById[profile.id] = profile;
      });
    } else if (profilesRes.error) {
      console.warn("dbLoadApplicants profiles error", profilesRes.error);
    }
  }

  if (appIds.length > 0) {
    var interviewsRes = await sb.from("interviews").select("*").in("application_id", appIds);
    if (!interviewsRes.error && Array.isArray(interviewsRes.data)) {
      interviewsRes.data.forEach(function(interview){
        if (!interviewsByAppId[interview.application_id]) interviewsByAppId[interview.application_id] = [];
        interviewsByAppId[interview.application_id].push(interview);
      });
    } else if (interviewsRes.error) {
      console.warn("dbLoadApplicants interviews error", interviewsRes.error);
    }
  }

  return apps.map(function(app){
    return Object.assign({}, app, {
      profile: profilesById[app.student_id] || null,
      student: studentsById[app.student_id] || null,
      interviews: interviewsByAppId[app.id] || []
    });
  });
}

async function dbUpdateAppStatus(appId, status) {
  if (!sb) return { error: "not_connected" };
  var res = await sb.from("applications").update({ status: status }).eq("id", appId);
  return res.error ? { error: res.error.message } : { ok: true };
}

async function dbAppendApplicationMessage(appId, message) {
  if (!sb) return { error: "not_connected" };
  var currentRes = await sb.from("applications").select("messages").eq("id", appId).maybeSingle();
  if (currentRes.error) return { error: currentRes.error.message };
  var current = Array.isArray(currentRes.data && currentRes.data.messages) ? currentRes.data.messages : [];
  var next = current.concat([message]);
  var saveRes = await sb.from("applications").update({ messages: next }).eq("id", appId);
  return saveRes.error ? { error: saveRes.error.message } : { ok: true };
}

async function dbScheduleInterview(appId, ivData) {
  if (!sb) return { error: "not_connected" };
  var existing = await sb.from("interviews").select("id").eq("application_id", appId).maybeSingle();
  if (existing.error) return { error: existing.error.message };
  var payload = { application_id: appId, interview_date: ivData.interview_date, interview_time: ivData.interview_time, location: ivData.location, notes: ivData.notes };
  var res = existing.data
    ? await sb.from("interviews").update(payload).eq("id", existing.data.id)
    : await sb.from("interviews").insert(payload);
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

function parseJobQuestions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      var parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      if (value.trim()) return [value.trim()];
    }
  }
  return [];
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      var parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

function splitName(fullName) {
  var parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ")
  };
}

function buildFullName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

var PERSONAL_EMAIL_DOMAINS = ["gmail.com","yahoo.com","outlook.com","hotmail.com","icloud.com","aol.com","me.com","live.com","msn.com","proton.me","protonmail.com"];

function normalizeDomain(value) {
  if (!value) return "";
  var text = String(value).trim().toLowerCase();
  text = text.replace(/^mailto:/, "");
  if (!/^https?:\/\//.test(text) && !text.includes("@")) text = "https://" + text;
  if (text.includes("@")) {
    return text.split("@").pop().split(/[/?#]/)[0].replace(/^www\./, "").trim();
  }
  try {
    return new URL(text).hostname.replace(/^www\./, "").trim();
  } catch {
    return text.replace(/^https?:\/\//, "").split("/")[0].split("?")[0].split("#")[0].replace(/^www\./, "").trim();
  }
}

function domainsMatch(emailDomain, websiteDomain) {
  if (!emailDomain || !websiteDomain) return false;
  return emailDomain === websiteDomain || emailDomain.endsWith("." + websiteDomain) || websiteDomain.endsWith("." + emailDomain);
}

function getEmployerVerificationMetadata(email, website, currentStatus) {
  var emailDomain = normalizeDomain(email);
  var websiteDomain = normalizeDomain(website);
  var isPersonal = PERSONAL_EMAIL_DOMAINS.includes(emailDomain);
  var emailDomainMatch = !isPersonal && domainsMatch(emailDomain, websiteDomain);
  var manualStatus = currentStatus === "approved" || currentStatus === "rejected" ? currentStatus : "pending";
  var verificationSignal = !websiteDomain ? "missing_website" : isPersonal ? "personal_email" : emailDomainMatch ? "domain_match" : "domain_mismatch";
  return {
    status: manualStatus,
    emailDomainMatch: emailDomainMatch,
    verificationSignal: verificationSignal
  };
}

function normalizeAppRole(role) {
  if (role === "employer") return "business";
  if (role === "business" || role === "student") return role;
  return "login";
}

function createStudentProfile(extra) {
  return {
    firstName: extra.firstName || "Alex",
    lastName: extra.lastName || "Johnson",
    email: extra.email || "alex.j@email.com",
    phone: extra.phone || "(214) 555-0192",
    school: extra.school || "Skyline High School",
    grade: extra.grade || "11th Grade",
    age: extra.age || "17",
    bio: extra.bio || "Motivated student looking for part-time work in the Dallas area.",
    skills: Array.isArray(extra.skills) ? extra.skills : ["Customer Service", "Microsoft Office", "Canva"]
  };
}

function createResumeData(extra) {
  return {
    firstName: extra.firstName || "Alex",
    lastName: extra.lastName || "Johnson",
    email: extra.email || "alex.j@email.com",
    phone: extra.phone || "(214) 555-0192",
    school: extra.school || "Skyline High School",
    grade: extra.grade || "11th Grade",
    gpa: extra.gpa || "3.8",
    summary: extra.summary || extra.bio || "Motivated student seeking part-time work to build professional skills.",
    skills: Array.isArray(extra.skills) ? extra.skills : ["Customer Service", "Microsoft Office", "Canva"],
    activities: Array.isArray(extra.activities) ? extra.activities : ["Debate Club Captain", "National Honor Society"],
    experience: Array.isArray(extra.experience) && extra.experience.length ? extra.experience : [{role:"Volunteer",org:"Dallas Food Bank",dates:"Sep 2024-Present",desc:"Sorted donations for 200+ families per shift."}],
    resumeUrl: extra.resumeUrl || ""
  };
}

function createBusinessProfile(extra) {
  var nameParts = extra.nm ? splitName(extra.nm) : { firstName: extra.firstName || "", lastName: extra.lastName || "" };
  return {
    co: extra.co || extra.company || "",
    nm: extra.nm || buildFullName(nameParts.firstName, nameParts.lastName) || "",
    email: extra.email || "",
    phone: extra.phone || "",
    addr: extra.addr || extra.address || "",
    web: extra.web || extra.website || "",
    ind: extra.ind || extra.industry || "",
    size: extra.size || extra.companySize || "",
    about: extra.about || "",
    verificationStatus: extra.verificationStatus || extra.verification_status || "pending",
    emailDomainMatch: extra.emailDomainMatch != null ? !!extra.emailDomainMatch : !!extra.email_domain_match,
    verificationSignal: extra.verificationSignal || extra.verification_signal || ""
  };
}

function createEmptyJobDraft() {
  return { title:"", type:"Part-Time", pay:"", loc:"", sched:"", train:"", desc:"", qs:[""], spots:1, tags:[], areaLabel:"Select area..." };
}

function jobToDraft(job) {
  return {
    title: job.title || "",
    type: job.type || "Part-Time",
    pay: job.pay || "",
    loc: job.loc || job.location || "",
    sched: job.sched || job.schedule || "",
    train: job.train || job.training || "",
    desc: job.desc || job.description || "",
    qs: parseJobQuestions(job.qs || job.questions).length ? parseJobQuestions(job.qs || job.questions) : [""],
    spots: job.spots || 1,
    tags: Array.isArray(job.tags) ? job.tags : [],
    areaLabel: job.areaLabel || job.area_label || inferAreaLabelFromJob(job)
  };
}

function resolveJobLogo(job) {
  if (job && job.iconKey === "star") return <FaStar />;
  if (job && job.logo && typeof job.logo === "object" && job.logo.$$typeof) return job.logo;
  return <FaBriefcase />;
}

function resolveAreaByLabel(label) {
  return AREAS.find(function(area){ return area.l === label; }) || null;
}

function inferAreaLabelFromJob(job) {
  if (job && (job.areaLabel || job.area_label)) return job.areaLabel || job.area_label;
  if (!job || !job.loc) return "Select area...";
  var lower = String(job.loc).toLowerCase();
  var match = AREAS.find(function(area){
    return area.la != null && lower.includes(area.l.toLowerCase().replace(", tx", "").replace("downtown ", "").replace("uptown ", ""));
  });
  return match ? match.l : "Select area...";
}

function getJobCoordinates(job) {
  if (job && job.la != null && job.lo != null) return { la: job.la, lo: job.lo };
  var area = resolveAreaByLabel(inferAreaLabelFromJob(job));
  return area && area.la != null ? { la: area.la, lo: area.lo } : { la: null, lo: null };
}

function normalizeJob(job) {
  if (!job) return job;
  var coords = getJobCoordinates(job);
  return Object.assign({}, job, {
    co: job.co || job.company_name || job.company || "Employer",
    employerOwnerId: job.employerOwnerId || job.employer_id || null,
    loc: job.loc || job.location || "Location TBD",
    sched: job.sched || job.schedule || "Flexible schedule",
    train: job.train || job.training || "Training provided",
    desc: job.desc || job.description || "",
    clr: job.clr || "#3B82F6",
    logo: resolveJobLogo(job),
    la: coords.la,
    lo: coords.lo,
    areaLabel: job.areaLabel || job.area_label || inferAreaLabelFromJob(job),
    spots: parseInt(job.spots, 10) || 1,
    tags: Array.isArray(job.tags) ? job.tags : [],
    qs: parseJobQuestions(job.qs || job.questions)
  });
}

// ─────────────────────────────────────────────────────────────
// LOCAL FALLBACK DATA
// Intentionally empty so students only see jobs created by businesses.
// ─────────────────────────────────────────────────────────────
var AREAS = [
  {l:"Select area...",la:null,lo:null},
  {l:"Downtown Dallas",la:32.777,lo:-96.797},{l:"Uptown Dallas",la:32.793,lo:-96.807},
  {l:"Plano",la:33.02,lo:-96.699},{l:"Frisco",la:33.151,lo:-96.824},
  {l:"Richardson",la:32.948,lo:-96.73},{l:"Garland",la:32.913,lo:-96.639},
  {l:"Irving",la:32.814,lo:-96.949},{l:"Arlington",la:32.736,lo:-97.108},
  {l:"McKinney",la:33.197,lo:-96.64},{l:"Allen",la:33.103,lo:-96.671},
];

var LOCAL_JOBS = [];

var LOCAL_APPS = [];

var LOCAL_APPLICANTS = [];

var PRESET_SKILLS = ["Customer Service","Teamwork","Communication","Microsoft Office","Google Workspace","Canva","Social Media","Photography","Public Speaking","Leadership","Time Management","Sales","Cash Handling","Data Entry","Excel","Spanish","Research","Writing","First Aid / CPR","Animal Care","Childcare","Cooking","Coding","Math Tutoring","Event Planning"];
var JOB_FILTER_TAGS = ["No Exp","16+","18+","College","STEM","Creative","Healthcare","Sports","Events","Outdoors"];

var EX_DATA = {firstName:"Morgan",lastName:"Taylor",email:"morgan.taylor@gmail.com",phone:"(214) 555-8834",school:"Jesuit College Prep",grade:"12th Grade",gpa:"3.9",summary:"Detail-oriented senior with leadership experience. Starting UT Austin Fall 2026.",skills:["Customer Service","Excel","Canva","Public Speaking","Bilingual Spanish"],activities:["Student Council President","National Honor Society VP","Varsity Cross Country Captain"],experience:[{role:"Sales Associate",org:"Barnes and Noble",dates:"Aug 2024-Present",desc:"Assisted customers, ran POS system. Employee of the Month Dec 2024."},{role:"Camp Counselor",org:"City of Dallas",dates:"Jun-Aug 2024",desc:"Led STEM activities for 25 campers with a team of 6 counselors."},{role:"Tutor",org:"Schoolhouse.world",dates:"Sep 2023-Present",desc:"Helped 4 students improve from C to A in math and English."}]};

var SHARED_STORE_KEY = "launchdfw_shared_state_v4";
var SHARED_EVENT = "launchdfw-shared-updated";

function formatShortDateTime(date) {
  return new Date(date).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}

function isDocumentResume(url) {
  return typeof url === "string" && /\.docx?(\?|#|$)/i.test(url);
}

function getResumePreviewUrl(url) {
  if (!url) return "";
  if (isDocumentResume(url)) {
    return "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(url);
  }
  return url;
}

function safeParseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function getDefaultDeadline(jobId) {
  var base = new Date("2026-04-28T12:00:00");
  base.setDate(base.getDate() + (parseInt(jobId, 10) % 6));
  return base.toISOString();
}

function getDaysUntil(dateValue) {
  var now = new Date();
  var then = new Date(dateValue);
  return Math.ceil((then - now) / 86400000);
}

function getEmployerVerificationStatus() {
  return "pending";
}

function getVerificationBadge(status) {
  return status === "approved"
    ? { text:"Verified Employer", color:PR, bg:PR+"16" }
    : status === "rejected"
      ? { text:"Verification Rejected", color:DN, bg:DN+"16" }
      : { text:"Pending Verification", color:WN, bg:"rgba(245,158,11,0.08)" };
}

function createSharedState() {
  return {
    applications: [],
    customJobs: [],
    jobOverrides: {},
    jobViews: {},
    notifications: [],
    onboardingSeen: {},
    savedDeadlineAlerts: {},
    employerProfiles: {}
  };
}

function readSharedState() {
  if (typeof window === "undefined") return createSharedState();
  var stored = safeParseJson(localStorage.getItem(SHARED_STORE_KEY), null);
  if (!stored || typeof stored !== "object") {
    stored = createSharedState();
    localStorage.setItem(SHARED_STORE_KEY, JSON.stringify(stored));
  }
  if (Array.isArray(stored.customJobs)) {
    stored.customJobs = stored.customJobs.map(function(job) {
      if (!job || typeof job !== "object") return job;
      var nextJob = Object.assign({}, job);
      if (nextJob.logo && typeof nextJob.logo === "object" && !nextJob.logo.$$typeof) delete nextJob.logo;
      if (!nextJob.iconKey && nextJob.employerOwnerId) nextJob.iconKey = "star";
      return nextJob;
    });
  }
  return Object.assign(createSharedState(), stored);
}

function writeSharedState(state) {
  if (typeof window === "undefined") return state;
  localStorage.setItem(SHARED_STORE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(SHARED_EVENT));
  return state;
}

function updateSharedState(updater) {
  var current = readSharedState();
  var next = updater(current);
  return writeSharedState(next);
}

function bindSharedStateListener(onChange) {
  function handleSharedEvent(){ onChange(); }
  function handleStorage(event){
    if(event.key === SHARED_STORE_KEY) onChange();
  }
  window.addEventListener(SHARED_EVENT, handleSharedEvent);
  window.addEventListener("storage", handleStorage);
  return function(){
    window.removeEventListener(SHARED_EVENT, handleSharedEvent);
    window.removeEventListener("storage", handleStorage);
  };
}

function applySharedJobs(baseJobs, includeCustomJobs) {
  if (includeCustomJobs === undefined) includeCustomJobs = true;
  var state = readSharedState();
  var withOverrides = baseJobs.map(function(job) {
    var override = state.jobOverrides[job.id] || {};
    return normalizeJob(Object.assign({}, job, override, {
      verificationStatus: override.verificationStatus || job.verificationStatus || getEmployerVerificationStatus(job.co || job.company_name || job.company || "Employer"),
      deadline: override.deadline || job.deadline || getDefaultDeadline(job.id)
    }));
  });
  var customJobs = includeCustomJobs ? (state.customJobs || []).map(function(job) {
    return normalizeJob(Object.assign({}, job, {
      verificationStatus: job.verificationStatus || getEmployerVerificationStatus(job.co || job.company_name || job.company || "Employer"),
      deadline: job.deadline || getDefaultDeadline(job.id)
    }));
  }) : [];
  var baseIds = withOverrides.map(function(job){ return String(job.id); });
  return withOverrides.concat(customJobs.filter(function(job){ return !baseIds.includes(String(job.id)); }));
}

function getSharedApplicationsForStudent(studentId) {
  return readSharedState().applications.filter(function(app) { return app.studentId === studentId; });
}

function getSharedApplicationsForJobs(jobIds) {
  return readSharedState().applications.filter(function(app) { return jobIds.includes(app.jobId); });
}

function getSharedApplicationById(appId) {
  return readSharedState().applications.find(function(app) { return String(app.id) === String(appId); }) || null;
}

function upsertSharedApplication(appId, updater) {
  updateSharedState(function(state){
    var found = false;
    state.applications = (state.applications || []).map(function(app){
      if(String(app.id) !== String(appId)) return app;
      found = true;
      return updater(app);
    });
    if(!found){
      state.applications = (state.applications || []).concat([updater({ id: appId, messages: [] })]);
    }
    return state;
  });
}

function addNotification(item) {
  updateSharedState(function(state) {
    state.notifications = [{
      id: "ntf-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
      read: false
    }].concat(state.notifications || []).map(function(entry, idx) {
      return idx < 80 ? Object.assign({}, entry, item) : entry;
    }).slice(0, 80);
    return state;
  });
}

function markNotificationsRead(userId, role) {
  updateSharedState(function(state) {
    state.notifications = (state.notifications || []).map(function(note) {
      if (note.userId === userId && note.role === role) return Object.assign({}, note, { read: true });
      return note;
    });
    return state;
  });
}

function getProfileCompletion(profile, resume, hasResume) {
  var checklist = [
    { key:"firstName", label:"First name", ok:!!profile.firstName },
    { key:"lastName", label:"Last name", ok:!!profile.lastName },
    { key:"email", label:"Email", ok:!!profile.email },
    { key:"phone", label:"Phone", ok:!!profile.phone },
    { key:"school", label:"School", ok:!!profile.school },
    { key:"grade", label:"Grade", ok:!!profile.grade },
    { key:"age", label:"Age", ok:!!profile.age },
    { key:"bio", label:"Bio", ok:!!profile.bio },
    { key:"skills", label:"Skills", ok:Array.isArray(profile.skills) && profile.skills.length > 0 },
    { key:"summary", label:"Resume summary", ok:!!resume.summary },
    { key:"experience", label:"Experience", ok:Array.isArray(resume.experience) && resume.experience.some(function(ex){return ex.role || ex.org || ex.desc;}) },
    { key:"resumeFile", label:"Resume upload", ok:!!hasResume }
  ];
  var complete = checklist.filter(function(item){ return item.ok; }).length;
  return {
    percent: Math.round((complete / checklist.length) * 100),
    missing: checklist.filter(function(item){ return !item.ok; }).map(function(item){ return item.label; })
  };
}

function inferJobSkills(job) {
  var text = [job.title, job.desc, job.sched, job.train].join(" ").toLowerCase();
  var tagSkills = (job.tags || []).filter(function(tag){ return PRESET_SKILLS.includes(tag); });
  var matches = PRESET_SKILLS.filter(function(skill) {
    var lower = skill.toLowerCase();
    return text.includes(lower) || (job.tags || []).some(function(tag){ return tag.toLowerCase() === lower; });
  });
  if (text.includes("customer")) matches.push("Customer Service");
  if (text.includes("leader")) matches.push("Leadership");
  if (text.includes("social")) matches.push("Social Media");
  if (text.includes("animal")) matches.push("Animal Care");
  if (text.includes("child") || text.includes("youth")) matches.push("Childcare");
  if (text.includes("cash")) matches.push("Cash Handling");
  if (text.includes("tech") || text.includes("coding")) matches.push("Coding");
  if (text.includes("camera") || text.includes("content")) matches.push("Photography");
  return Array.from(new Set(tagSkills.concat(matches))).slice(0, 6);
}

function getSkillGap(profileSkills, job) {
  var wanted = inferJobSkills(job);
  var mine = Array.isArray(profileSkills) ? profileSkills : [];
  return {
    matched: wanted.filter(function(skill){ return mine.includes(skill); }),
    missing: wanted.filter(function(skill){ return !mine.includes(skill); }),
    wanted: wanted
  };
}

function scoreJobForStudent(job, profile, apps, area) {
  var score = 0;
  var gap = getSkillGap(profile.skills || [], job);
  score += gap.matched.length * 4;
  score -= gap.missing.length;
  if ((job.tags || []).includes("16+") && parseInt(profile.age, 10) >= 16) score += 2;
  if ((job.tags || []).includes("18+") && parseInt(profile.age, 10) >= 18) score += 2;
  if ((job.tags || []).includes("College") && String(profile.grade || "").toLowerCase().includes("12")) score += 1;
  if (profile.school && job.loc && job.loc.toLowerCase().includes("dallas")) score += 1;
  if (area && area.la && job.la && job.lo) {
    var miles = calcMiles(area.la, area.lo, job.la, job.lo);
    score += Math.max(0, 5 - Math.floor(miles / 5));
  }
  if (apps.some(function(app){ return app.jobId === job.id && app.status === "accepted"; })) score -= 10;
  return score;
}

function escapePdfText(text) {
  return String(text || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildResumePdfBlob(resumeData) {
  var lines = [
    resumeData.firstName + " " + resumeData.lastName,
    resumeData.email + " | " + resumeData.phone,
    resumeData.school + " | " + resumeData.grade + (resumeData.gpa ? " | GPA " + resumeData.gpa : ""),
    "",
    "SUMMARY",
    resumeData.summary || "",
    "",
    "SKILLS",
    (resumeData.skills || []).join(", "),
    "",
    "ACTIVITIES",
    (resumeData.activities || []).join(" | "),
    "",
    "EXPERIENCE"
  ];
  (resumeData.experience || []).forEach(function(ex) {
    lines.push((ex.role || "") + (ex.org ? " - " + ex.org : ""));
    lines.push(ex.dates || "");
    lines.push(ex.desc || "");
    lines.push("");
  });
  var contentLines = ["BT", "/F1 12 Tf", "50 770 Td"];
  lines.forEach(function(line, idx) {
    if (idx > 0) contentLines.push("0 -16 Td");
    contentLines.push("(" + escapePdfText(line) + ") Tj");
  });
  contentLines.push("ET");
  var stream = contentLines.join("\n");
  var objects = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj");
  objects.push("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj");
  objects.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj");
  objects.push("5 0 obj << /Length " + stream.length + " >> stream\n" + stream + "\nendstream endobj");
  var pdf = "%PDF-1.4\n";
  var offsets = [0];
  objects.forEach(function(obj) {
    offsets.push(pdf.length);
    pdf += obj + "\n";
  });
  var xref = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n";
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach(function(offset) {
    pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  });
  pdf += "trailer << /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return new Blob([pdf], { type: "application/pdf" });
}

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
  var isSubtle = props.v === "subtle";
  var bg=props.v==="pr"||!props.v?PR:props.v==="dn"?DN:props.v==="or"?OR:"rgba(255,255,255,0.08)";
  return <div onClick={props.onClick} style={Object.assign({background:bg,color:isSubtle?TX:"#000",border:isSubtle?"1px solid "+BR:"none",borderRadius:10,fontFamily:FB,fontWeight:800,padding:props.lg?"13px 26px":props.sm?"6px 13px":"9px 18px",fontSize:props.lg?15:props.sm?12:13,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5},props.sx||{})}>{props.ch}</div>;
}
function Lbl(props){return <p style={{color:MU,fontSize:11,fontWeight:700,marginBottom:4}}>{props.t}</p>;}
function Inp(props){return <input value={props.v} onChange={props.onChange} placeholder={props.ph} type={props.tp||"text"} style={Object.assign({},INP,props.sx||{})}/>;}
function Txa(props){return <textarea value={props.v} onChange={props.onChange} onClick={props.onClick} placeholder={props.ph} style={Object.assign({},INP,{height:props.h||72,resize:"vertical"})}/>;}

function Modal(props){
  return(
    <div onClick={function(e){if(e.target===e.currentTarget)props.onClose();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:SF,border:"1px solid "+BR,borderRadius:20,width:"100%",maxWidth:props.w||480,maxHeight:"88vh",overflowY:"auto"}}>{props.children}</div>
    </div>
  );
}

function HeaderBell(props){
  var unread = props.notifications.filter(function(note){ return !note.read; }).length;
  var bellRef = useRef(null);

  useEffect(function(){
    if(!props.open) return;
    function handleClick(event){
      if(bellRef.current && !bellRef.current.contains(event.target)){
        props.onClose();
      }
    }
    window.addEventListener("mousedown", handleClick);
    return function(){
      window.removeEventListener("mousedown", handleClick);
    };
  },[props.open, props.onClose]);

  return(
    <div ref={bellRef} style={{position:"relative"}}>
      <div onClick={props.onToggle} style={{width:38,height:38,borderRadius:11,border:"1px solid "+BR,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:props.open?PR+"18":SF,color:props.open?PR:TX,position:"relative"}}>
        <FaBell />
        {unread>0&&<span style={{position:"absolute",top:-4,right:-4,minWidth:18,height:18,borderRadius:999,background:OR,color:"#000",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 5px"}}>{unread}</span>}
      </div>
      {props.open&&<div style={{position:"absolute",right:0,top:46,width:320,background:SF,border:"1px solid "+BR,borderRadius:14,boxShadow:"0 18px 40px rgba(0,0,0,0.35)",overflow:"hidden",zIndex:50}}>
        <div style={{padding:"12px 14px",borderBottom:"1px solid "+BR,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <p style={{color:"#fff",fontWeight:800,fontSize:13}}>Notifications</p>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {props.notifications.length>0&&<span onClick={props.onMarkRead} style={{color:PR,fontSize:11,fontWeight:700,cursor:"pointer"}}>Mark all read</span>}
            <span onClick={props.onClose} style={{color:MU,fontSize:14,fontWeight:800,cursor:"pointer"}}>x</span>
          </div>
        </div>
        <div style={{maxHeight:340,overflowY:"auto"}}>
          {props.notifications.length===0&&<p style={{padding:18,color:MU,fontSize:12}}>No notifications yet.</p>}
          {props.notifications.map(function(note){
            return <div key={note.id} onClick={function(){props.onJump(note);}} style={{padding:"12px 14px",borderBottom:"1px solid "+BR,cursor:"pointer",background:note.read?"transparent":"rgba(0,200,150,0.06)"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:3}}>
                <p style={{color:"#fff",fontSize:12,fontWeight:800}}>{note.title}</p>
                <span style={{color:MU,fontSize:10,whiteSpace:"nowrap"}}>{formatShortDateTime(note.createdAt)}</span>
              </div>
              <p style={{color:MU,fontSize:11,lineHeight:1.5}}>{note.body}</p>
            </div>;
          })}
        </div>
      </div>}
    </div>
  );
}

function ApplicationMessages(props){
  var [draft,setDraft]=useState("");
  return(
    <div onClick={function(e){e.stopPropagation();}} style={bx({background:BG,marginTop:10})}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
        <FaCommentDots color={PR} />
        <p style={{color:"#fff",fontWeight:800,fontSize:12}}>In-App Messages</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:180,overflowY:"auto",marginBottom:10}}>
        {(props.messages || []).length===0&&<p style={{color:MU,fontSize:11}}>No messages yet. Keep all communication here for safety.</p>}
        {(props.messages || []).map(function(message){
          var mine = message.senderRole === props.role;
          return <div key={message.id} style={{alignSelf:mine?"flex-end":"flex-start",maxWidth:"85%",background:mine?PR+"20":"rgba(255,255,255,0.05)",border:"1px solid "+(mine?PR+"44":BR),borderRadius:10,padding:"8px 10px"}}>
            <p style={{color:mine?PR:"#fff",fontSize:10,fontWeight:800,marginBottom:2}}>{message.senderName}</p>
            <p style={{color:"#D1D5DB",fontSize:12,lineHeight:1.5}}>{message.body}</p>
            <p style={{color:MU,fontSize:10,marginTop:4}}>{formatShortDateTime(message.createdAt)}</p>
          </div>;
        })}
      </div>
      <div style={{display:"flex",gap:8}}>
        <Inp v={draft} onChange={function(e){setDraft(e.target.value);}} ph={props.placeholder||"Type a message..."} sx={{flex:1}}/>
        <Btn ch={<><FaPaperPlane /> Send</>} sm onClick={function(e){ if(e&&e.stopPropagation)e.stopPropagation(); if(!draft.trim()) return; props.onSend(draft.trim()); setDraft(""); }}/>
      </div>
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

  function handleLogin(u){
    var nextRole = normalizeAppRole(u && u.role);
    setUser(Object.assign({}, u, { role: nextRole }));
    setScreen(nextRole);
  }
  function handleLogout(){setUser(null);setScreen("login");if(sb)sb.auth.signOut();}

  // Check if already signed in on load
  useEffect(function(){
    if(!sb)return;
    sb.auth.getSession().then(function(res){
      if(res.data&&res.data.session){
        var uid=res.data.session.user.id;
        sb.from("profiles").select("role,first_name,last_name").eq("id",uid).maybeSingle().then(function(p){
          if(!p.error && p.data) handleLogin({uid,role:normalizeAppRole(p.data.role),name:p.data.first_name+" "+p.data.last_name});
        });
      }
    });
  },[]);

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#060A12 0%,#0A1120 100%)",fontFamily:FB,color:TX}}>
      <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:8px}.hov:hover{opacity:0.85}.jc{transition:all .15s;cursor:pointer}.jc:hover{background:#1A2540!important;transform:translateY(-1px)}.ni{transition:all .12s;cursor:pointer}.ni:hover{background:rgba(255,255,255,.07)!important}input,textarea,select{color-scheme:dark}textarea{resize:vertical;font-family:'Plus Jakarta Sans',sans-serif}`}</style>
      {screen==="login"   &&<LoginScreen onLogin={handleLogin} show={show}/>}
      {screen==="student" &&<StudentApp user={user} show={show} logout={handleLogout} initialNav={user&&user.startNav}/>}
      {screen==="business"&&<BizApp     user={user} show={show} logout={handleLogout} initialNav={user&&user.startNav}/>}
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
  var [studentForm,setStudentForm]=useState({firstName:"",lastName:"",school:"",grade:"",age:"",phone:"",bio:""});
  var [businessForm,setBusinessForm]=useState({company:"",firstName:"",lastName:"",phone:"",address:"",website:"",industry:"",companySize:"",about:""});
  var [isNew,setIsNew]=useState(false);
  var [loading,setLoading]=useState(false);

  async function handleStudentAuth(){
    if(!email||!pw){props.show("Enter email and password","err");return;}
    if(isNew&&(!studentForm.firstName||!studentForm.lastName||!studentForm.school||!studentForm.grade||!studentForm.age||!studentForm.phone)){props.show("Complete all required student fields","err");return;}
    setLoading(true);
    if(!sb){
      // Demo mode - no real auth
      props.onLogin({uid:"demo-student",role:"student",name:buildFullName(studentForm.firstName, studentForm.lastName)||"Alex Johnson",startNav:isNew?"profile":"jobs",studentProfile:createStudentProfile(Object.assign({},studentForm,{email:email}))});
      setLoading(false);return;
    }
    var res;
    if(isNew){
      res=await dbSignUp(email,pw,"student",Object.assign({},studentForm,{email:email,summary:studentForm.bio}));
    } else {
      res=await dbSignIn(email,pw);
      if(res.role && res.role !== "student"){
        props.show("This email is registered as an employer account. Please sign in as employer.","err");
        setLoading(false);return;
      }
    }
    setLoading(false);
    if(res.error){props.show(res.error==="not_connected"?"Add your Supabase keys to connect":res.error,"err");return;}
    props.onLogin({uid:res.uid||res.uid,role:"student",name:res.name||buildFullName(studentForm.firstName, studentForm.lastName),startNav:isNew?"profile":"jobs",studentProfile:isNew?createStudentProfile(Object.assign({},studentForm,{email:email})):null});
  }

  async function handleBizAuth(){
    if(!email||!pw){props.show("Enter email and password","err");return;}
    if(isNew&&(!businessForm.company||!businessForm.firstName||!businessForm.lastName||!businessForm.phone||!businessForm.address||!businessForm.website||!businessForm.industry||!businessForm.companySize||!businessForm.about)){props.show("Complete all required employer fields","err");return;}
    setLoading(true);
    var verificationMeta = getEmployerVerificationMetadata(email, businessForm.website, "pending");
    if(!sb){
      props.onLogin({uid:"demo-biz",role:"business",name:businessForm.company||"Houndstooth Coffee",startNav:isNew?"profile":"overview",businessProfile:createBusinessProfile(Object.assign({},businessForm,{email:email,verificationStatus:verificationMeta.status,emailDomainMatch:verificationMeta.emailDomainMatch,verificationSignal:verificationMeta.verificationSignal}))});
      setLoading(false);return;
    }
    var res;
    if(isNew){
      res=await dbSignUp(email,pw,"employer",Object.assign({},businessForm,{email:email}));
    } else {
      res=await dbSignIn(email,pw);
      if(res.role && res.role !== "employer"){
        props.show("This email is registered as a student account. Please sign in as student.","err");
        setLoading(false);return;
      }
    }
    setLoading(false);
    if(res.error){props.show(res.error==="not_connected"?"Add your Supabase keys to connect":res.error,"err");return;}
    props.onLogin({uid:res.uid,role:"business",name:businessForm.company||res.name,startNav:isNew?"profile":"overview",businessProfile:isNew?createBusinessProfile(Object.assign({},businessForm,{email:email,verificationStatus:verificationMeta.status,emailDomainMatch:verificationMeta.emailDomainMatch,verificationSignal:verificationMeta.verificationSignal})):null});
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
              {isNew&&mode==="student"&&<>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
                  <div><Lbl t="FIRST NAME"/><Inp v={studentForm.firstName} onChange={function(e){var val=e.target.value;setStudentForm(function(p){return Object.assign({},p,{firstName:val});});}} ph="Alex"/></div>
                  <div><Lbl t="LAST NAME"/><Inp v={studentForm.lastName} onChange={function(e){var val=e.target.value;setStudentForm(function(p){return Object.assign({},p,{lastName:val});});}} ph="Johnson"/></div>
                </div>
                <div><Lbl t="SCHOOL"/><Inp v={studentForm.school} onChange={function(e){var val=e.target.value;setStudentForm(function(p){return Object.assign({},p,{school:val});});}} ph="Skyline High School"/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
                  <div><Lbl t="GRADE"/><Inp v={studentForm.grade} onChange={function(e){var val=e.target.value;setStudentForm(function(p){return Object.assign({},p,{grade:val});});}} ph="11th Grade"/></div>
                  <div><Lbl t="AGE"/><Inp v={studentForm.age} onChange={function(e){var val=e.target.value;setStudentForm(function(p){return Object.assign({},p,{age:val});});}} ph="17"/></div>
                </div>
                <div><Lbl t="PHONE"/><Inp v={studentForm.phone} onChange={function(e){var val=e.target.value;setStudentForm(function(p){return Object.assign({},p,{phone:val});});}} ph="(214) 555-0192"/></div>
                <div><Lbl t="SHORT BIO"/><Txa v={studentForm.bio} onChange={function(e){var val=e.target.value;setStudentForm(function(p){return Object.assign({},p,{bio:val});});}} ph="Tell employers what kind of work you're looking for..." h={68}/></div>
              </>}
              {isNew&&mode==="business"&&<>
                <div><Lbl t="COMPANY NAME"/><Inp v={businessForm.company} onChange={function(e){var val=e.target.value;setBusinessForm(function(p){return Object.assign({},p,{company:val});});}} ph="Houndstooth Coffee"/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
                  <div><Lbl t="CONTACT FIRST NAME"/><Inp v={businessForm.firstName} onChange={function(e){var val=e.target.value;setBusinessForm(function(p){return Object.assign({},p,{firstName:val});});}} ph="Sarah"/></div>
                  <div><Lbl t="CONTACT LAST NAME"/><Inp v={businessForm.lastName} onChange={function(e){var val=e.target.value;setBusinessForm(function(p){return Object.assign({},p,{lastName:val});});}} ph="Mitchell"/></div>
                </div>
                <div><Lbl t="PHONE"/><Inp v={businessForm.phone} onChange={function(e){var val=e.target.value;setBusinessForm(function(p){return Object.assign({},p,{phone:val});});}} ph="(214) 555-3377"/></div>
                <div><Lbl t="ADDRESS"/><Inp v={businessForm.address} onChange={function(e){var val=e.target.value;setBusinessForm(function(p){return Object.assign({},p,{address:val});});}} ph="2817 Commerce St, Dallas TX"/></div>
                <div><Lbl t="WEBSITE"/><Inp v={businessForm.website} onChange={function(e){var val=e.target.value;setBusinessForm(function(p){return Object.assign({},p,{website:val});});}} ph="houndstoothcoffee.com"/></div>
                <p style={{color:MU,fontSize:11,marginTop:-5}}>Use your real business website. Matching your work email to this domain helps reviewers, but every employer still starts in Pending Verification until manually approved.</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
                  <div><Lbl t="INDUSTRY"/><Inp v={businessForm.industry} onChange={function(e){var val=e.target.value;setBusinessForm(function(p){return Object.assign({},p,{industry:val});});}} ph="Food and Beverage"/></div>
                  <div><Lbl t="COMPANY SIZE"/><Inp v={businessForm.companySize} onChange={function(e){var val=e.target.value;setBusinessForm(function(p){return Object.assign({},p,{companySize:val});});}} ph="11-50 employees"/></div>
                </div>
                <div><Lbl t="ABOUT THE BUSINESS"/><Txa v={businessForm.about} onChange={function(e){var val=e.target.value;setBusinessForm(function(p){return Object.assign({},p,{about:val});});}} ph="What should students know about your business?" h={68}/></div>
              </>}
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
  var [nav,setNav]=useState(props.initialNav||"jobs");
  var [selJob,setSelJob]=useState(null);
  var [jobs,setJobs]=useState(applySharedJobs([], !sb));
  var [apps,setApps]=useState([]);
  var [saved,setSaved]=useState([]);
  var [resume,setResume]=useState(null);
  var [rd,setRd]=useState(createResumeData(props.user&&props.user.studentProfile?props.user.studentProfile:{}));
  var [tmpl,setTmpl]=useState("classic");
  var [prof,setProf]=useState(createStudentProfile(props.user&&props.user.studentProfile?props.user.studentProfile:{}));
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
  var [bellOpen,setBellOpen]=useState(false);
  var [walkthroughOpen,setWalkthroughOpen]=useState(false);
  var [walkStep,setWalkStep]=useState(0);
  var [sharedTick,setSharedTick]=useState(0);
  var fileRef=useRef();
  var sharedState = readSharedState();
  var notifications = (sharedState.notifications || []).filter(function(note){ return note.userId===props.user?.uid && note.role==="student"; });

  useEffect(function(){
    if(props.initialNav) setNav(props.initialNav);
  },[props.initialNav]);

  useEffect(function(){
    return bindSharedStateListener(function(){ setSharedTick(function(t){ return t+1; }); });
  },[]);

  useEffect(function(){
    if(props.user&&props.user.studentProfile){
      setProf(function(p){return Object.assign({}, p, props.user.studentProfile);});
      setPd(function(p){return Object.assign({}, p, props.user.studentProfile);});
      setRd(function(r){return Object.assign({}, r, createResumeData(props.user.studentProfile));});
    }
  },[props.user]);

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

  useEffect(function(){
    if(!props.user || sb) return;
    setJobs(applySharedJobs([], true));
    var mapped = getSharedApplicationsForStudent(props.user.uid).map(function(a){
      return {id:a.id,jobId:a.jobId,status:a.status,applied:a.applied,note:a.note||"",iv:a.iv||null,ans:a.ans||{},messages:a.messages||[]};
    });
    setApps(mapped);
  },[props.user, sharedTick]);

  useEffect(function(){
    if(!props.user) return;
    var walkthroughKey = "launchdfw_onboarding_seen_" + props.user.uid;
    if(!localStorage.getItem(walkthroughKey)) {
      setWalkthroughOpen(true);
      setWalkStep(0);
    }
  },[props.user]);

  useEffect(function(){
    if(!props.user || jobs.length===0 || saved.length===0) return;
    saved.forEach(function(jobId){
      var job = jobs.find(function(entry){ return entry.id===jobId; });
      if(!job) return;
      var days = getDaysUntil(job.deadline || getDefaultDeadline(job.id));
      var flagKey = props.user.uid + "-" + job.id;
      if(days <= 2 && days >= 0 && !sharedState.savedDeadlineAlerts[flagKey]){
        addNotification({
          userId: props.user.uid,
          role: "student",
          title: "Saved job closing soon",
          body: (job.title || "A saved job") + " is expected to close in " + days + " day" + (days===1?"":"s") + ".",
          nav: "saved",
          jobId: job.id
        });
        updateSharedState(function(state){
          state.savedDeadlineAlerts[flagKey] = true;
          return state;
        });
      }
    });
  },[saved, jobs, props.user, sharedTick]);

  // Load real data from Supabase when connected
  useEffect(function(){
    if(!sb||!props.user)return;
    dbLoadJobs().then(function(data){
      if(Array.isArray(data)) setJobs(applySharedJobs(data.map(normalizeJob), false));
    });
    dbLoadMyApps(props.user.uid).then(function(data){
      if(!Array.isArray(data)){ setApps([]); return; }
      var mapped=data.map(function(a){
        var sharedApp = getSharedApplicationById(a.id);
        var dbIv=a.interviews&&a.interviews[0]?{date:a.interviews[0].interview_date,time:a.interviews[0].interview_time,loc:a.interviews[0].location,notes:a.interviews[0].notes}:null;
        var iv=sharedApp&&sharedApp.iv?Object.assign({}, dbIv || {}, sharedApp.iv):dbIv;
        return {
          id:a.id,
          jobId:a.job_id,
          status:a.status,
          applied:new Date(a.applied_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}),
          note:a.note||"",
          iv,
          ans:parseJsonObject(a.answers),
          messages:(sharedApp && sharedApp.messages) || (Array.isArray(a.messages) ? a.messages : [])
        };
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
  },[props.user, sharedTick]);

  function hasApp(id){return apps.some(function(a){return a.jobId===id;});}

  function syncStudentApplication(updatedApp) {
    setApps(function(prev){
      var exists = prev.some(function(entry){ return entry.id === updatedApp.id; });
      if(!exists) return prev.concat([updatedApp]);
      return prev.map(function(entry){ return entry.id === updatedApp.id ? Object.assign({}, entry, updatedApp) : entry; });
    });
  }

  function sendMessage(appId, body) {
    var job = jobs.find(function(entry){ return apps.find(function(app){ return app.id===appId && app.jobId===entry.id; }); });
    var message = { id:"msg-" + Date.now(), senderRole:"student", senderName:buildFullName(prof.firstName, prof.lastName) || props.user.name, body:body, createdAt:new Date().toISOString() };
    if(sb) dbAppendApplicationMessage(appId, message);
    upsertSharedApplication(appId, function(app){
      return Object.assign({}, app, { messages:(app.messages || []).concat([message]) });
    });
    syncStudentApplication({ id: appId, messages: ((apps.find(function(app){ return app.id === appId; }) || {}).messages || []).concat([message]) });
    addNotification({
      userId: (job && job.employerOwnerId) || "demo-biz",
      role: "business",
      title: "New student message",
      body: (buildFullName(prof.firstName, prof.lastName) || "A student") + " sent a message about " + (job ? job.title : "an application") + ".",
      nav: "applicants",
      appId: appId
    });
    setSharedTick(function(t){ return t+1; });
  }

  function respondInterview(appId, response, responseNote) {
    var appForInterview = apps.find(function(app){ return app.id===appId; });
    var relatedJob = appForInterview ? jobs.find(function(job){ return job.id===appForInterview.jobId; }) : null;
    upsertSharedApplication(appId, function(app){
      return Object.assign({}, app, { iv: Object.assign({}, app.iv || {}, { status:response, responseNote:responseNote || "" }) });
    });
    syncStudentApplication({ id: appId, iv: Object.assign({}, (appForInterview && appForInterview.iv) || {}, { status:response, responseNote:responseNote || "" }) });
    addNotification({
      userId: (relatedJob && relatedJob.employerOwnerId) || "demo-biz",
      role: "business",
      title: "Interview response received",
      body: (buildFullName(prof.firstName, prof.lastName) || "A student") + (response==="confirmed" ? " confirmed their interview." : " requested a different interview time."),
      nav: "interviews",
      appId: appId
    });
    setSharedTick(function(t){ return t+1; });
    props.show(response==="confirmed" ? "Interview confirmed" : "Reschedule request sent","info");
  }

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
  var FLTS=["All","Part-Time","Full-Time","Internship","Seasonal","No Exp","16+","18+","College","STEM","Creative","Healthcare","Sports","Events","Outdoors"];
  var profileCompletion = getProfileCompletion(prof, rd, !!resume);

  var filteredJobs=jobs.filter(function(j){
    if(flt!=="All"&&j.type!==flt&&!(j.tags||[]).includes(flt))return false;
    if(q&&![j.title,j.co,j.loc].some(function(x){return x.toLowerCase().includes(q.toLowerCase());}))return false;
    if(area.la){
      if(j.la == null || j.lo == null) return false;
      if(calcMiles(area.la,area.lo,j.la,j.lo)>radius) return false;
    }
    return true;
  });
  var recommendedJobs = filteredJobs.slice().sort(function(a,b){ return scoreJobForStudent(b, prof, apps, area) - scoreJobForStudent(a, prof, apps, area); }).filter(function(job){ return !hasApp(job.id); }).slice(0,3);

  async function openApply(job){
    if(!resume){props.show("Upload resume first!","err");setNav("resume");setSelJob(null);return;}
    if((job.tags || []).includes("18+") && parseInt(prof.age, 10) < 18){
      props.show("This role is 18+ only, so you cannot apply yet.","err");
      return;
    }
    if(hasApp(job.id)){props.show("Already applied","info");return;}
    setApplyJob(job);setApplyStep(0);setAvail(["Sat","Sun"]);setAnote("");setAAns({});
  }

  async function submitApp(){
    try {
      setLoading(true);
      if((applyJob.tags || []).includes("18+") && parseInt(prof.age, 10) < 18){
        props.show("This role is 18+ only, so you cannot apply yet.","err");
        setLoading(false);
        return;
      }
      var appId = "app-"+Date.now();
      if(sb&&props.user){
        var res=await dbSubmitApp(applyJob.id,props.user.uid,avail,anote,aAns);
        if(res.error){props.show("Could not submit: "+res.error,"err");setLoading(false);return;}
        if(res.data && res.data.id) appId = res.data.id;
      }
      var newApp = {id:appId,jobId:applyJob.id,status:"pending",applied:"Today",note:anote||"",iv:null,ans:aAns,messages:[]};
      updateSharedState(function(state){
        state.applications = state.applications.concat([{
          id:appId,
          jobId:applyJob.id,
          studentId:props.user.uid,
          studentName:buildFullName(prof.firstName, prof.lastName) || props.user.name,
          school:prof.school,
          grade:prof.grade,
          age:prof.age,
          email:prof.email,
          applied:"Today",
          status:"pending",
          note:anote || "",
          ans:aAns,
          iv:null,
          messages:[],
          resumeUrl:(resume && resume.url) || rd.resumeUrl || "",
          resumeData:Object.assign({}, rd),
          employerNotes:"",
          starred:false,
          flagged:false,
          viewedAt:Date.now()
        }]);
        return state;
      });
      syncStudentApplication(newApp);
      addNotification({
        userId:applyJob.employerOwnerId || "demo-biz",
        role:"business",
        title:"New application received",
        body:(buildFullName(prof.firstName, prof.lastName) || "A student") + " applied to " + applyJob.title + ".",
        nav:"applicants",
        appId:newApp.id,
        jobId:applyJob.id
      });
      setApplyJob(null);setSelJob(null);setLoading(false);
      props.show("Application submitted! Success");
    } catch (e) {
      console.error("Submit app error:", e);
      props.show("Unexpected error: " + e.message,"err");
      setLoading(false);
    }
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

  var applyCompany=applyJob?(applyJob.co||applyJob.company_name||applyJob.company||"Employer"):"";
  var qs=applyJob?parseJobQuestions(applyJob.qs||applyJob.questions):[];
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
              <p style={{color:MU,fontSize:11}}>Live business-posted jobs only{props.user&&sb?" - Signed in as "+props.user.name:""}</p>
          </div>
          <div style={{display:"flex",gap:9,alignItems:"center"}}>
            <HeaderBell
              open={bellOpen}
              onToggle={function(){setBellOpen(!bellOpen);}}
              onClose={function(){setBellOpen(false);}}
              notifications={notifications}
              onMarkRead={function(){markNotificationsRead(props.user.uid,"student");setSharedTick(function(t){return t+1;});}}
              onJump={function(note){setBellOpen(false);if(note.nav) setNav(note.nav); if(note.jobId){ var job = jobs.find(function(entry){ return entry.id===note.jobId; }); if(job) setSelJob(job); }}}
            />
            {!resume?<span style={pill(WN)}><FaExclamationTriangle /> Upload resume to apply</span>:<span style={pill(PR)}><FaCheck /> Resume ready</span>}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"20px 22px",display:"flex",gap:0}}>
          <div style={{flex:1,minWidth:0}}>

            {nav==="jobs"&&<StudentJobsPage jobs={filteredJobs} recommendedJobs={recommendedJobs} profile={prof} allJobs={jobs} flt={flt} setFlt={setFlt} q={q} setQ={setQ} area={area} setArea={setArea} radius={radius} setRadius={setRadius} setSelJob={function(job){setSelJob(job); updateSharedState(function(state){ state.jobViews[job.id] = (state.jobViews[job.id] || 0) + 1; return state; }); }} saved={saved} togSave={togSave} hasApp={hasApp} FLTS={FLTS}/>}

            {nav==="saved"&&(
              saved.length===0
                ?<div style={bx({textAlign:"center",padding:40})}><p style={{fontSize:36,marginBottom:12}}><FaHeart size={36} /></p><p style={{color:"#fff",fontWeight:700,marginBottom:12}}>No saved jobs yet</p><Btn ch="Browse Jobs" onClick={function(){setNav("jobs");}}/></div>
                :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:11}}>{jobs.filter(function(j){return saved.includes(j.id);}).map(function(j){return <JobCard key={j.id} job={j} saved togSave={togSave} onClick={function(){setSelJob(j);}} applied={hasApp(j.id)} area={area}/>;})}</div>
            )}

            {nav==="resume"&&<StudentResumePage resume={resume} setResume={setResume} rd={rd} setRd={setRd} tmpl={tmpl} setTmpl={setTmpl} tab={resTab} setTab={setResTab} show={props.show} fileRef={fileRef} nsk={nsk} setNsk={setNsk} user={props.user}/>}

            {nav==="apps"&&<AppsView apps={apps} jobs={jobs} setNav={setNav} role="student" onSendMessage={sendMessage}/>}

            {nav==="ivs"&&<StudentIVView apps={apps} jobs={jobs} onRespondInterview={respondInterview}/>}

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
                  <Btn ch={editP?"Cancel":"Edit Profile"} v={editP?"subtle":"pr"} onClick={function(){setPd(Object.assign({},prof));setEditP(!editP);}}/>
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
                    <div style={{display:"flex",gap:8}}><Btn ch="Save Changes" lg onClick={saveProfile}/><Btn ch="Cancel" v="subtle" onClick={function(){setEditP(false);}}/></div>
                  </div>
                ):(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:13}}>
                    <div style={bx()}><h3 style={{fontFamily:FH,fontSize:13,fontWeight:700,color:"#fff",marginBottom:11}}>Contact Info</h3>{[["Email",prof.email],["Phone",prof.phone],["School",prof.school],["Grade",prof.grade],["Age",prof.age]].map(function(pair){return <div key={pair[0]} style={{marginBottom:8}}><p style={{color:MU,fontSize:10,fontWeight:700}}>{pair[0]}</p><p style={{color:"#fff",fontSize:12,fontWeight:600}}>{pair[1]}</p></div>;})}</div>
                    <div style={bx()}><h3 style={{fontFamily:FH,fontSize:13,fontWeight:700,color:"#fff",marginBottom:11}}>Profile Strength</h3><div style={{marginBottom:8}}><div style={{height:10,borderRadius:999,background:"rgba(255,255,255,0.06)",overflow:"hidden"}}><div style={{width:profileCompletion.percent+"%",height:"100%",background:"linear-gradient(90deg,"+PR+","+OR+")"}}/></div><p style={{color:PR,fontSize:12,fontWeight:800,marginTop:7}}>{profileCompletion.percent}% complete</p></div><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>{prof.skills.map(function(sk){return <span key={sk} style={pill(PR)}>{sk}</span>;})}</div>{profileCompletion.missing.length>0?<div><p style={{color:MU,fontSize:11,fontWeight:700,marginBottom:6}}>Still missing:</p><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{profileCompletion.missing.map(function(item){return <span key={item} style={pill(WN,"rgba(245,158,11,0.08)")}>{item}</span>;})}</div></div>:<p style={{color:"#6EE7B7",fontSize:12,fontWeight:700}}><FaCheckCircle /> Your profile is application-ready.</p>}</div>
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
                    <Btn ch="Close" v="subtle" sm onClick={function(){setSelJob(null);}}/>
                    <span className="hov" onClick={function(){togSave(selJob.id);}} style={{fontSize:18,cursor:"pointer"}}>{saved.includes(selJob.id)?<FaHeart color="#ff0000" />:<FaHeart />}</span>
                  </div>
                  <div style={{display:"flex",gap:11,alignItems:"center"}}>
                    <div style={{width:48,height:48,borderRadius:13,background:selJob.clr+"22",border:"2px solid "+selJob.clr+"55",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{selJob.logo}</div>
                    <div>
                      <h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff",marginBottom:2}}>{selJob.title}</h2>
                      <p style={{color:MU,fontSize:12}}>{selJob.co||selJob.company_name||selJob.company||"Employer"} - {selJob.loc||selJob.location||"Location TBD"}</p>
                      <p style={{color:getVerificationBadge(selJob.verificationStatus).color,fontSize:11,marginTop:3,fontWeight:800}}>{getVerificationBadge(selJob.verificationStatus).text}</p>
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
                  {getSkillGap(prof.skills, selJob).wanted.length>0&&<div style={{background:"rgba(255,255,255,0.03)",border:"1px solid "+BR,borderRadius:9,padding:"10px 12px",marginBottom:12}}><p style={{color:"#fff",fontSize:11,fontWeight:800,marginBottom:6}}>Skills Gap</p><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:7}}>{getSkillGap(prof.skills, selJob).matched.map(function(skill){return <span key={skill} style={pill(PR)}>{skill}</span>;})}{getSkillGap(prof.skills, selJob).missing.map(function(skill){return <span key={skill} style={pill(WN,"rgba(245,158,11,0.08)")}>Add {skill}</span>;})}</div><p style={{color:MU,fontSize:11}}>Adding the highlighted skills to your profile or resume can make you a stronger fit.</p></div>}
                  <div style={{background:"rgba(0,200,150,0.07)",border:"1px solid "+PR+"33",borderRadius:9,padding:"10px 12px",marginBottom:12}}><p style={{color:PR,fontSize:11,fontWeight:800,marginBottom:2}}><FaLock /> Safe Communication</p><p style={{color:"#6EE7B7",fontSize:11}}>All messages stay in-app. Contact info is never shared.</p></div>
                  {(selJob.tags || []).includes("18+") && parseInt(prof.age, 10) < 18 && <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid "+DN+"44",borderRadius:9,padding:"10px 12px",marginBottom:12}}><p style={{color:DN,fontSize:12,fontWeight:800}}>Age verification gate</p><p style={{color:"#FCA5A5",fontSize:11}}>This listing requires applicants to be 18 or older based on the age in your profile.</p></div>}
                  {!resume&&<div style={{background:"rgba(245,158,11,0.08)",border:"1px solid "+WN+"44",borderRadius:9,padding:"10px 12px",marginBottom:10}}><p style={{color:WN,fontSize:12,fontWeight:800}}>Warning: Upload resume to apply</p></div>}
                  {hasApp(selJob.id)
                    ?<div style={{background:"rgba(0,200,150,0.1)",border:"1px solid "+PR+"44",borderRadius:11,padding:13,textAlign:"center"}}><p style={{fontSize:24,marginBottom:4}}><FaCheck size={24} /></p><p style={{color:PR,fontWeight:800,fontSize:13}}>Already Applied! Check Applications.</p></div>
                    :<Btn ch={resume?(((selJob.tags || []).includes("18+") && parseInt(prof.age, 10) < 18)?"18+ Required":"Apply Now"):"Upload Resume First"} lg sx={{width:"100%",justifyContent:"center",opacity:((selJob.tags || []).includes("18+") && parseInt(prof.age, 10) < 18)?0.7:1}} onClick={function(){openApply(selJob);}}/>
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
            <div><p style={{color:PR,fontSize:10,fontWeight:800,marginBottom:2}}>APPLYING TO {applyCompany.toUpperCase()}</p><h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff"}}>{applyJob.title}</h2></div>
            <Btn ch="X" v="subtle" sm onClick={function(){setApplyJob(null);}}/>
          </div>
          <div style={{padding:"12px 18px 18px"}}>
            <div style={{display:"flex",gap:4,marginBottom:14}}>{steps.map(function(s,i){return <div key={s} style={{flex:1,textAlign:"center"}}><div style={{width:20,height:20,borderRadius:"50%",background:i<=applyStep?PR:"rgba(255,255,255,0.1)",color:i<=applyStep?"#000":MU,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 3px"}}>{i+1}</div><p style={{color:i===applyStep?PR:MU,fontSize:9,fontWeight:700}}>{s}</p></div>;})}
            </div>
            {applyStep===0&&<div><p style={{color:MU,fontSize:13,marginBottom:9}}>Applying as: {rd.firstName} {rd.lastName} - {rd.school}</p><div style={{display:"flex",gap:9,background:"rgba(0,200,150,0.07)",border:"1px solid "+PR+"33",borderRadius:9,padding:"10px 12px",alignItems:"center"}}><span style={{color:PR,fontSize:12,fontWeight:700}}><FaFileAlt /> {resume?resume.name+" attached":"No resume"}</span></div></div>}
            {applyStep===1&&<div><p style={{color:MU,fontSize:13,marginBottom:9}}>Select days you are available.</p><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:11}}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(function(d){return <div key={d} className="ni" onClick={function(){setAvail(function(p){return p.includes(d)?p.filter(function(x){return x!==d;}):p.concat([d]);});}} style={{background:avail.includes(d)?PR+"22":"rgba(255,255,255,0.04)",border:"1px solid "+(avail.includes(d)?PR:BR),color:avail.includes(d)?PR:MU,borderRadius:8,padding:"6px 11px",fontSize:12,fontWeight:700}}>{d}</div>;})} </div><Lbl t="NOTE TO EMPLOYER (optional)"/><Txa v={anote} onChange={function(e){setAnote(e.target.value);}} ph="Why you are excited about this role..." h={64}/></div>}
            {applyStep===2&&qs.length>0&&<div><p style={{color:MU,fontSize:13,marginBottom:11}}>Answer the employer questions.</p>{qs.map(function(q2,i){return <div key={i} style={{marginBottom:11}}><Lbl t={"Q"+(i+1)+": "+q2}/><Txa v={aAns[q2]||""} onChange={function(e){var val=e.target.value;setAAns(function(p){return Object.assign({},p,{[q2]:val});});}} ph="Your answer..." h={60}/></div>;})}</div>}
            {applyStep===steps.length-1&&<div><p style={{color:MU,fontSize:13,marginBottom:11}}>Review before submitting.</p><div style={bx({marginBottom:11})}>{[["Job",applyJob.title+" at "+applyCompany],["Available",avail.join(", ")||"Not set"],["Resume",resume?resume.name:"None"]].map(function(pair){return <div key={pair[0]} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+BR,fontSize:12}}><span style={{color:MU}}>{pair[0]}</span><span style={{color:"#fff",fontWeight:700}}>{pair[1]}</span></div>;})}</div></div>}
            <div style={{display:"flex",gap:8,marginTop:13}}>
              {applyStep>0&&<Btn ch="Back" v="gh" onClick={function(){setApplyStep(function(s){return s-1;});}}/>}
              <Btn ch={loading?"Submitting...":(applyStep<steps.length-1?"Continue":"Submit Application")} lg sx={{flex:1,justifyContent:"center"}} onClick={function(){applyStep<steps.length-1?setApplyStep(function(s){return s+1;}):submitApp();}}/>
            </div>
          </div>
        </Modal>
      )}

      {walkthroughOpen&&<Modal onClose={function(){setWalkthroughOpen(false);localStorage.setItem("launchdfw_onboarding_seen_" + props.user.uid,"yes");}}>
        <div style={{padding:"16px 18px",borderBottom:"1px solid "+BR}}>
          <p style={{color:PR,fontSize:10,fontWeight:800,marginBottom:3}}>GETTING STARTED</p>
          <h2 style={{fontFamily:FH,fontSize:16,fontWeight:800,color:"#fff"}}>Your first steps on LaunchDFW</h2>
        </div>
        <div style={{padding:"18px"}}>
          {[{title:"Upload or build your resume",copy:"Employers can only review you once your resume is ready.",nav:"resume"},{title:"Finish your profile",copy:"Add your age, bio, and skills so recommendations and safety checks work.",nav:"profile"},{title:"Apply and watch messages",copy:"After your first application, keep all conversation inside the app.",nav:"jobs"}].map(function(step,i){return <div key={step.title} style={{display:"flex",gap:10,marginBottom:12,opacity:i===walkStep?1:0.55}}><div style={{width:28,height:28,borderRadius:8,background:(i<=walkStep?PR:BR),display:"flex",alignItems:"center",justifyContent:"center",color:i<=walkStep?"#000":MU,fontWeight:800,fontSize:12,flexShrink:0}}>{i+1}</div><div><p style={{color:"#fff",fontWeight:800,fontSize:13,marginBottom:2}}>{step.title}</p><p style={{color:MU,fontSize:12,lineHeight:1.6}}>{step.copy}</p></div></div>;})}
          <div style={{display:"flex",gap:8,marginTop:16}}>
            {walkStep<2?<Btn ch="Next Tip" lg sx={{flex:1,justifyContent:"center"}} onClick={function(){setWalkStep(function(s){return s+1;});}}/>:<Btn ch="Finish Walkthrough" lg sx={{flex:1,justifyContent:"center"}} onClick={function(){setWalkthroughOpen(false);localStorage.setItem("launchdfw_onboarding_seen_" + props.user.uid,"yes");}}/>}
            <Btn ch="Take Me There" v="subtle" onClick={function(){var nextNav=["resume","profile","jobs"][walkStep];setNav(nextNav);setWalkthroughOpen(false);localStorage.setItem("launchdfw_onboarding_seen_" + props.user.uid,"yes");}}/>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

function StudentJobsPage(props){
  return(
    <div>
      <div style={{background:"linear-gradient(135deg,#0A1628,#0D1F3C)",border:"1px solid rgba(0,200,150,0.2)",borderRadius:16,padding:"16px 20px",marginBottom:14}}>
        <p style={{color:PR,fontSize:10,fontWeight:800,letterSpacing:2,marginBottom:3}}><FaMapMarker /> LIVE BUSINESS JOB BOARD</p>
        <h2 style={{fontFamily:FH,fontSize:19,fontWeight:800,color:"#fff",marginBottom:4}}>{props.allJobs.length} Live Student Opportunities</h2>
        <p style={{color:MU,fontSize:12,marginBottom:10}}>Only jobs created by businesses appear here. No seeded or fake listings.</p>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {[{n:props.allJobs.filter(function(j){return j.posted==="Today";}).length,l:"Posted Today"},{n:props.allJobs.filter(function(j){return (j.spots||0) > 0;}).length,l:"Open Listings"},{n:props.allJobs.reduce(function(total, job){ return total + (parseInt(job.spots, 10) || 0); }, 0),l:"Total Spots"},{n:props.allJobs.length,l:"Total Jobs"}].map(function(s){return <div key={s.l} style={{textAlign:"center"}}><p style={{fontFamily:FH,fontSize:18,fontWeight:800,color:PR}}>{s.n}</p><p style={{color:MU,fontSize:10}}>{s.l}</p></div>;})}
        </div>
      </div>
      {props.recommendedJobs && props.recommendedJobs.length>0&&<div style={bx({marginBottom:14,borderColor:PR+"33"})}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div><p style={{color:PR,fontSize:11,fontWeight:800,letterSpacing:1}}>RECOMMENDED FOR YOU</p><p style={{color:MU,fontSize:12}}>Based on your skills, age, location, and application history.</p></div>
          <span style={pill(PR)}>{props.profile.skills.length} skills on profile</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:10}}>
          {props.recommendedJobs.map(function(job){return <JobCard key={"rec-"+job.id} job={job} area={props.area} onClick={function(){props.setSelJob(job);}} saved={props.saved.includes(job.id)} togSave={props.togSave} applied={props.hasApp(job.id)} />;})}
        </div>
      </div>}
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
      {props.jobs.length===0&&<p style={{color:MU,textAlign:"center",padding:"40px 0"}}>{props.allJobs.length===0?"No live jobs yet. Businesses need to post listings before students can apply.":"No jobs match. Try adjusting filters or radius."}</p>}
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
        <span style={pill(getVerificationBadge(job.verificationStatus).color, getVerificationBadge(job.verificationStatus).bg)}>{getVerificationBadge(job.verificationStatus).text}</span>
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
  var [openApp,setOpenApp]=useState(null);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:11,marginBottom:18}}>
        {[{icon:<FaCheck />,label:"Accepted",k:"accepted",c:"#10B981"},{icon:<FaHourglassHalf />,label:"Under Review",k:"pending",c:WN},{icon:<FaTimes />,label:"Not Selected",k:"declined",c:DN}].map(function(s){return <div key={s.label} style={bx({textAlign:"center"})}><p style={{fontFamily:FH,fontSize:20,fontWeight:800,color:s.c}}>{props.apps.filter(function(a){return a.status===s.k;}).length}</p><p style={{color:MU,fontSize:11,marginTop:2}}>{s.icon} {s.label}</p></div>;})}
      </div>
      {props.apps.length===0?<div style={bx({textAlign:"center",padding:40})}><p style={{color:MU,fontSize:13,marginBottom:14}}>No applications yet</p><Btn ch="Browse Jobs" onClick={function(){props.setNav("jobs");}}/></div>
      :<div style={{display:"flex",flexDirection:"column",gap:11}}>{props.apps.map(function(app){
        var job=props.jobs.find(function(j){return j.id===app.jobId;});if(!job)return null;
        var s=sc[app.status];
        var isOpen = openApp === app.id;
        return <div key={app.id||app.jobId} style={bx({border:"1px solid "+s.c+"33"})}>
          <div style={{display:"flex",gap:12}}>
            <div style={{width:44,height:44,borderRadius:11,background:job.clr+"22",border:"1px solid "+job.clr+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{job.logo}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div><p style={{color:"#fff",fontWeight:800,fontSize:14,fontFamily:FH}}>{job.title}</p><p style={{color:MU,fontSize:12}}>{job.co} - Applied {app.applied}</p></div>
                <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}><div style={{background:s.bg,border:"1px solid "+s.c+"44",borderRadius:9,padding:"7px 12px",textAlign:"center",minWidth:110}}><p style={{color:s.c,fontSize:12,fontWeight:800}}>{s.l}</p></div><Btn ch={isOpen?"Hide Messages":"Messages"} v="gh" sm onClick={function(){setOpenApp(isOpen?null:app.id);}}/></div>
              </div>
              {app.status==="accepted"&&app.iv&&<div style={{marginTop:9,background:"rgba(0,200,150,0.07)",border:"1px solid "+PR+"33",borderRadius:9,padding:"9px 11px"}}><p style={{color:PR,fontWeight:800,fontSize:12,marginBottom:2}}><FaCalendar /> Interview Scheduled!</p><p style={{color:"#6EE7B7",fontSize:12}}>{app.iv.date} at {app.iv.time} - {app.iv.loc}</p></div>}
              {app.status==="accepted"&&!app.iv&&<div style={{marginTop:9,background:"rgba(16,185,129,0.07)",border:"1px solid #10B98133",borderRadius:9,padding:"9px 11px"}}><p style={{color:"#10B981",fontSize:12,fontWeight:800}}><FaCheck /> Accepted! {app.note}</p></div>}
              {app.status==="declined"&&<div style={{marginTop:9,background:"rgba(239,68,68,0.06)",border:"1px solid #EF444433",borderRadius:9,padding:"9px 11px"}}><p style={{color:DN,fontSize:12,fontWeight:800}}>Keep going - most students apply to 5+ jobs. {app.note}</p></div>}
              {app.status==="pending"&&<div style={{marginTop:9,background:"rgba(245,158,11,0.06)",border:"1px solid #F59E0B33",borderRadius:9,padding:"9px 11px"}}><p style={{color:WN,fontSize:12,fontWeight:800}}><FaHourglassHalf /> Under review - typically 3 to 5 business days</p></div>}
              {isOpen&&<ApplicationMessages role={props.role} messages={app.messages||[]} onSend={function(body){props.onSendMessage(app.id, body);}} placeholder="Message this employer safely..." />}
            </div>
          </div>
        </div>;
      })}</div>}
    </div>
  );
}

function StudentIVView(props){
  var [requestNote,setRequestNote]=useState({});
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
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:9}}>
                <span style={pill(iv.status==="confirmed"?PR:iv.status==="requested_new_time"?WN:BL)}>{iv.status==="confirmed"?"Confirmed":iv.status==="requested_new_time"?"Reschedule Requested":"Awaiting Your Response"}</span>
                {iv.responseNote&&<span style={pill(WN,"rgba(245,158,11,0.08)")}>{iv.responseNote}</span>}
              </div>
              {iv.status!=="confirmed"&&<div style={{marginBottom:10}}>
                <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <Btn ch="Confirm Time" sm onClick={function(){props.onRespondInterview(app.id,"confirmed","Student confirmed");}}/>
                  <Btn ch="Request Different Time" v="gh" sm onClick={function(){props.onRespondInterview(app.id,"requested_new_time",requestNote[app.id]||"Please suggest another time.");}}/>
                </div>
                <Inp v={requestNote[app.id]||""} onChange={function(e){var val=e.target.value;setRequestNote(function(p){return Object.assign({},p,{[app.id]:val});});}} ph="Optional note if you need a different time..." />
              </div>}
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
  function downloadResumePdf(){
    var blob = buildResumePdfBlob(props.rd);
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = (props.rd.firstName || "student") + "_" + (props.rd.lastName || "resume") + ".pdf";
    link.click();
    URL.revokeObjectURL(url);
    props.show("PDF downloaded!","info");
  }
  async function handleUpload(e){
    var f=e.target.files[0];if(!f)return;
    if(!f.type.includes("pdf")&&!f.name.endsWith(".docx")){props.show("PDF or Word only","err");return;}
    var uploadUrl = "";
    if(sb&&props.user){
      var res=await dbUploadResume(props.user.uid,f);
      if(res.error){props.show("Upload failed: "+res.error,"err");return;}
      // Save the resume URL to database
      const updateRes = await sb.from("students").update({ resume_url: res.url }).eq("id", props.user.uid);
      if(updateRes.error){props.show("Failed to save resume URL: "+updateRes.error.message,"err");return;}
      uploadUrl = res.url;
    }
    props.setResume({name:f.name,size:(f.size/1024).toFixed(0)+"KB", url: uploadUrl});
    props.setRd(function(prev){return Object.assign({}, prev, { resumeUrl: uploadUrl || prev.resumeUrl || "" });});
    props.show("Resume uploaded! Success");
  }
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
        {[{id:"upload",l:<><FaUpload /> Upload</>},{id:"builder",l:<><FaWrench /> Resume Builder</>},{id:"templates",l:<><FaPalette /> Templates</>},{id:"example",l:<><FaFileAlt /> Example</>}].map(function(t){return <Btn key={t.id} ch={t.l} v={props.tab===t.id?"pr":"subtle"} onClick={function(){props.setTab(t.id);}}/>;}) }
      </div>
      {props.tab==="upload"&&<div style={{maxWidth:480}}>
        <div className="hov" onClick={function(){props.fileRef.current.click();}} style={{border:"2px dashed "+(props.resume?PR:BR),borderRadius:16,padding:"28px 22px",textAlign:"center",background:props.resume?"rgba(0,200,150,0.05)":CD,marginBottom:14,cursor:"pointer"}}>
          <input ref={props.fileRef} type="file" accept=".pdf,.docx" onChange={handleUpload} style={{display:"none"}}/>
          {props.resume?<div><p style={{fontSize:32,marginBottom:8}}><FaCheck /></p><p style={{color:PR,fontSize:14,fontWeight:800}}>{props.resume.name}</p><p style={{color:MU,fontSize:12}}>{props.resume.size} - Click to replace</p></div>:<div><p style={{fontSize:32,marginBottom:8}}><FaUpload /></p><p style={{color:"#fff",fontSize:14,fontWeight:800,marginBottom:3}}>Upload Your Resume</p><p style={{color:MU,fontSize:12}}>PDF or Word (.docx)</p></div>}
        </div>
        {!props.resume&&<div style={bx({textAlign:"center"})}><p style={{color:MU,fontSize:13,marginBottom:11}}>Do not have one yet?</p><div style={{display:"flex",gap:9,justifyContent:"center"}}><Btn ch="Build One" onClick={function(){props.setTab("builder");}}/><Btn ch="See Example" v="subtle" onClick={function(){props.setTab("example");}}/></div></div>}
        {props.resume&&<div style={bx({display:"flex",justifyContent:"space-between",alignItems:"center"})}><p style={{color:PR,fontWeight:800}}>Resume on file - ready to apply!</p><div style={{display:"flex",gap:8}}><Btn ch="View Resume" v="subtle" sm onClick={function(){if(props.resume.url)window.open(props.resume.url,'_blank');}}/><Btn ch="Remove" v="subtle" sm onClick={async function(){props.setResume(null);props.setRd(function(prev){return Object.assign({}, prev, { resumeUrl: "" });});if(sb&&props.user){const res=await sb.from("students").update({resume_url:null}).eq("id",props.user.uid);if(res.error)props.show("Failed to remove: "+res.error.message,"err");else props.show("Removed","info");}else props.show("Removed","info");}}/></div></div>}
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
            <Btn ch="+ Add Experience" v="subtle" sm onClick={function(){props.setRd(function(p){return Object.assign({},p,{experience:p.experience.concat([{role:"",org:"",dates:"",desc:""}])});});}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn ch="Download PDF" v="subtle" lg sx={{flex:1,justifyContent:"center"}} onClick={downloadResumePdf}/>
            <Btn ch="Save and Use This Resume" lg sx={{flex:1,justifyContent:"center"}} onClick={async function(){
            if(sb&&props.user){
              await dbSaveProfile(props.user.uid, props.rd);
              await dbSaveResumeData(props.user.uid, props.rd);
              props.show("Resume data saved!");
            }
            props.setResume(function(prev){return {name:(prev&&prev.name)||props.rd.firstName+"_"+props.rd.lastName+"_Resume.pdf",size:(prev&&prev.size)||"Saved",url:(prev&&prev.url)||props.rd.resumeUrl||""};});
            props.show("Resume saved! You can now apply.");
            props.setTab("upload");
          }}/>
          </div>
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
  var [nav,setNav]=useState(props.initialNav||"overview");
  var [applicants,setApplicants]=useState([]);
  var [fj,setFj]=useState("all");
  var [selA,setSelA]=useState(null);
  var [showRes,setShowRes]=useState(false);
  var [showIV,setShowIV]=useState(false);
  var [ivDraft,setIvDraft]=useState({date:"",time:"",loc:"",notes:""});
  var [showAdd,setShowAdd]=useState(false);
  var [editJobId,setEditJobId]=useState(null);
  var [myJobs,setMyJobs]=useState([]);
  var [nj,setNj]=useState(createEmptyJobDraft());
  var [biz,setBiz]=useState(createBusinessProfile(props.user&&props.user.businessProfile?props.user.businessProfile:{company:props.user?props.user.name:""}));
  var [editB,setEditB]=useState(false);
  var [bd,setBd]=useState(Object.assign({},biz));
  var [selectedApps,setSelectedApps]=useState([]);
  var [bellOpen,setBellOpen]=useState(false);
  var [sharedTick,setSharedTick]=useState(0);
  var sharedState = readSharedState();
  var notifications = (sharedState.notifications || []).filter(function(note){ return note.role==="business" && note.userId === (props.user?.uid || "demo-biz"); });

  useEffect(function(){
    if(props.initialNav) setNav(props.initialNav);
  },[props.initialNav]);

  useEffect(function(){
    return bindSharedStateListener(function(){ setSharedTick(function(t){ return t+1; }); });
  },[]);

  useEffect(function(){
    if(props.user&&props.user.businessProfile){
      var nextBiz = createBusinessProfile(props.user.businessProfile);
      setBiz(nextBiz);
      setBd(Object.assign({}, nextBiz));
    }
  },[props.user]);

  // Load real data from Supabase when connected
  useEffect(function(){
    if(!sb||!props.user)return;
    dbLoadMyJobs(props.user.uid).then(function(data){
      if(Array.isArray(data)) setMyJobs(applySharedJobs(data.map(normalizeJob), false).filter(function(job){ return String(job.employerOwnerId || job.employer_id || "") === String(props.user.uid); }));
    });
    dbLoadEmployerProfile(props.user.uid).then(function(data){
      if(!data) return;
      var mapped = createBusinessProfile({
        company: data.employer.company_name || props.user.name,
        firstName: data.profile.first_name || splitName(data.employer.contact_name || "").firstName,
        lastName: data.profile.last_name || splitName(data.employer.contact_name || "").lastName,
        email: data.employer.email || data.profile.email || "",
        phone: data.employer.phone || "",
        address: data.employer.address || "",
        website: data.employer.website || "",
        industry: data.employer.industry || "",
        companySize: data.employer.company_size || "",
        about: data.employer.about || "",
        verificationStatus: data.employer.verification_status || "pending",
        emailDomainMatch: data.employer.email_domain_match,
        verificationSignal: data.employer.verification_signal || ""
      });
      setBiz(mapped);
      setBd(Object.assign({}, mapped));
    });
    dbLoadApplicants(props.user.uid).then(function(data){
      if(Array.isArray(data)){
        var mapped = data.map(function(a){
          var sharedApp = getSharedApplicationById(a.id);
          var student = a.student || a.students || null;
          var interviews = Array.isArray(a.interviews) ? a.interviews : [];
          var firstName = a.profile && a.profile.first_name ? a.profile.first_name : (student && student.first_name ? student.first_name : "");
          var lastName = a.profile && a.profile.last_name ? a.profile.last_name : (student && student.last_name ? student.last_name : "");
          var fullName = (firstName + " " + lastName).trim();
          var dbIv = interviews[0] ? {date: interviews[0].interview_date, time: interviews[0].interview_time, loc: interviews[0].location, notes: interviews[0].notes} : null;
          return {
            id: a.id,
            jobId: a.job_id,
            studentId: a.student_id,
            name: fullName || (student && student.email) || "Student Applicant",
            school: student && student.school ? student.school : "",
            grade: student && student.grade ? student.grade : "",
            age: student && student.age ? student.age : "",
            email: student && student.email ? student.email : "",
            applied: a.applied_at ? new Date(a.applied_at).toLocaleDateString() : "Today",
            status: a.status,
            note: a.note,
            ans: parseJsonObject(a.answers),
            iv: sharedApp && sharedApp.iv ? Object.assign({}, dbIv || {}, sharedApp.iv) : dbIv,
            resumeUrl: (student && student.resume_url) || (sharedApp && sharedApp.resumeUrl) || "",
            resumeData: (sharedApp && sharedApp.resumeData) || {
              firstName: firstName || "",
              lastName: lastName || "",
              email: student && student.email ? student.email : "",
              phone: student && student.phone ? student.phone : "",
              school: student && student.school ? student.school : "",
              grade: student && student.grade ? student.grade : "",
              gpa: student && student.gpa ? student.gpa : "",
              summary: student && student.summary ? student.summary : "",
              skills: student && Array.isArray(student.skills) ? student.skills : [],
              activities: student && Array.isArray(student.activities) ? student.activities : [],
              experience: student && Array.isArray(student.experience) ? student.experience : [],
              resumeUrl: student && student.resume_url ? student.resume_url : ""
            },
            employerNotes: (sharedApp && sharedApp.employerNotes) || "",
            starred: !!(sharedApp && sharedApp.starred),
            flagged: !!(sharedApp && sharedApp.flagged),
            messages: (sharedApp && sharedApp.messages) || (Array.isArray(a.messages) ? a.messages : [])
          };
        });
        setApplicants(mapped);
      } else {
        setApplicants([]);
      }
    });
  },[props.user, sharedTick]);

  useEffect(function(){
    if(sb || !props.user) return;
    var sharedJobs = applySharedJobs([]).filter(function(job){
      return job.employerOwnerId === props.user.uid || (biz.co && job.co === biz.co);
    });
    setMyJobs(sharedJobs);
    var mapped = getSharedApplicationsForJobs(sharedJobs.map(function(job){ return job.id; })).map(function(a){
      return {
        id:a.id,
        jobId:a.jobId,
        studentId:a.studentId,
        name:a.studentName,
        school:a.school,
        grade:a.grade,
        age:a.age,
        email:a.email,
        applied:a.applied,
        status:a.status,
        note:a.note,
        ans:a.ans || {},
        iv:a.iv || null,
        resumeUrl:a.resumeUrl || "",
        resumeData:a.resumeData || null,
        employerNotes:a.employerNotes || "",
        starred:!!a.starred,
        flagged:!!a.flagged,
        messages:a.messages || []
      };
    });
    setApplicants(mapped);
  },[props.user, biz.co, sharedTick]);

  async function updStatus(id,st){
    if(sb){var res=await dbUpdateAppStatus(id,st);if(res.error){props.show("Error: "+res.error,"err");return;}}
    updateSharedState(function(state){
      state.applications = state.applications.map(function(app){
        return app.id===id ? Object.assign({}, app, { status:st }) : app;
      });
      return state;
    });
    setApplicants(function(p){return p.map(function(a){return a.id===id?Object.assign({},a,{status:st}):a;});});
    setSelA(function(p){return p&&p.id===id?Object.assign({},p,{status:st}):p;});
    var target = applicants.find(function(app){ return app.id===id; });
    if(target){
      addNotification({
        userId: target.studentId || "demo-student",
        role: "student",
        title: "Application update",
        body: "Your application for " + ((myJobs.find(function(job){ return job.id===target.jobId; }) || {}).title || "a job") + " is now " + st + ".",
        nav: "apps",
        appId: id,
        jobId: target.jobId
      });
    }
    props.show(st==="accepted"?"Accepted!":st==="declined"?"Declined":"Moved to pending","info");
  }

  function bulkUpdate(status) {
    selectedApps.forEach(function(id){ updStatus(id, status); });
    setSelectedApps([]);
  }

  function sendEmployerMessage(appId, body) {
    var applicant = applicants.find(function(entry){ return entry.id===appId; });
    var message = { id:"msg-" + Date.now(), senderRole:"business", senderName:biz.co, body:body, createdAt:new Date().toISOString() };
    if(sb) dbAppendApplicationMessage(appId, message);
    upsertSharedApplication(appId, function(app){
      return Object.assign({}, app, { messages:(app.messages || []).concat([message]) });
    });
    setApplicants(function(prev){
      return prev.map(function(app){
        return app.id===appId ? Object.assign({}, app, { messages:(app.messages || []).concat([message]) }) : app;
      });
    });
    setSelA(function(prev){
      return prev&&prev.id===appId ? Object.assign({}, prev, { messages:(prev.messages || []).concat([message]) }) : prev;
    });
    if(applicant){
      addNotification({
        userId: applicant.studentId || "demo-student",
        role: "student",
        title: "New employer message",
        body: biz.co + " sent a message about your application.",
        nav: "apps",
        appId: appId
      });
    }
    setSharedTick(function(t){ return t+1; });
  }

  function updateApplicantMeta(appId, fields) {
    upsertSharedApplication(appId, function(app){
      return Object.assign({}, app, fields);
    });
    setApplicants(function(prev){ return prev.map(function(app){ return app.id===appId ? Object.assign({}, app, fields) : app; }); });
    setSelA(function(prev){ return prev&&prev.id===appId ? Object.assign({}, prev, fields) : prev; });
    setSharedTick(function(t){ return t+1; });
  }

  async function schedIV(){
    if(!ivDraft.date||!ivDraft.time||!ivDraft.loc){props.show("Fill in date, time, and location","err");return;}
    if(sb&&selA){await dbScheduleInterview(selA.id,{interview_date:ivDraft.date,interview_time:ivDraft.time,location:ivDraft.loc,notes:ivDraft.notes});}
    updateApplicantMeta(selA.id,{iv:Object.assign({status:"pending_confirmation",responseNote:""},ivDraft)});
    setShowIV(false);props.show("Interview scheduled! Scheduled");
    addNotification({
      userId: selA.studentId || "demo-student",
      role: "student",
      title: "Interview scheduled",
      body: "You have a new interview request from " + biz.co + ".",
      nav: "ivs",
      appId: selA.id,
      jobId: selA.jobId
    });
  }

  function openCreateJob(){
    setEditJobId(null);
    setNj(createEmptyJobDraft());
    setShowAdd(true);
  }

  function openEditJob(job){
    setEditJobId(job.id);
    setNj(jobToDraft(job));
    setShowAdd(true);
  }

  async function deleteJob(job){
    if(typeof window !== "undefined" && !window.confirm("Delete this job post? Students will no longer see it.")) return;
    if(sb&&props.user){
      var res = await dbDeleteJob(props.user.uid, job.id);
      if(res.error){props.show("Error: "+res.error,"err");return;}
    }
    setMyJobs(function(prev){ return prev.filter(function(entry){ return String(entry.id) !== String(job.id); }); });
    updateSharedState(function(state){
      state.customJobs = (state.customJobs || []).filter(function(entry){ return String(entry.id) !== String(job.id); });
      if(state.jobOverrides && state.jobOverrides[job.id]) delete state.jobOverrides[job.id];
      return state;
    });
    if(String(fj) === String(job.id)) setFj("all");
    if(selA && String(selA.jobId) === String(job.id)) setSelA(null);
    props.show("Job deleted","info");
  }

  async function addJob(){
    if(!nj.title||!nj.pay||!nj.desc){props.show("Title, pay, and description required","err");return;}
    var selectedArea = resolveAreaByLabel(nj.areaLabel) || resolveAreaByLabel(inferAreaLabelFromJob({ loc:nj.loc }));
    var coords = selectedArea && selectedArea.la != null ? { la:selectedArea.la, lo:selectedArea.lo } : getJobCoordinates({ loc:nj.loc, areaLabel:nj.areaLabel });
    var cleanedQuestions=nj.qs.filter(function(q){return q.trim();});
    var cleanedTags=(nj.tags || []).filter(Boolean);
    var resolvedAreaLabel = (selectedArea && selectedArea.l) || inferAreaLabelFromJob({ loc:nj.loc }) || nj.areaLabel;
    var dbJobData={title:nj.title,type:nj.type,pay:nj.pay,location:nj.loc,schedule:nj.sched,training:nj.train,description:nj.desc,questions:cleanedQuestions,spots:parseInt(nj.spots,10)||1,is_active:true,area_label:resolvedAreaLabel};
    var jobViewData={loc:nj.loc,sched:nj.sched,train:nj.train,desc:nj.desc,qs:cleanedQuestions,tags:cleanedTags,la:coords.la,lo:coords.lo,areaLabel:resolvedAreaLabel,spots:parseInt(nj.spots,10)||1};
    if(editJobId){
      if(sb&&props.user){var updRes=await dbUpdateJob(props.user.uid,editJobId,dbJobData);if(updRes.error){props.show("Error: "+updRes.error,"err");return;}}
      setMyJobs(function(p){return p.map(function(job){return String(job.id)===String(editJobId)?normalizeJob(Object.assign({},job,dbJobData,jobViewData,{co:biz.co})):job;});});
      updateSharedState(function(state){
        state.jobOverrides[editJobId] = Object.assign({}, state.jobOverrides[editJobId] || {}, dbJobData, jobViewData, { co:biz.co });
        return state;
      });
      setShowAdd(false);setEditJobId(null);setNj(createEmptyJobDraft());
      props.show("Job updated! Success");
      return;
    }
    var createdRow = null;
    if(sb&&props.user){
      var res=await dbPostJob(props.user.uid,dbJobData);
      if(res.error){props.show("Error: "+res.error,"err");return;}
      createdRow = res.data || null;
    }
    var newJobId = createdRow && createdRow.id ? createdRow.id : Date.now();
    var storedJob=Object.assign({}, createdRow || dbJobData, jobViewData, {id:newJobId,co:biz.co,iconKey:"star",clr:"#F59E0B",posted:"Today",employerOwnerId:props.user.uid,verificationStatus:biz.verificationStatus || "pending",deadline:getDefaultDeadline(newJobId)});
    var localJob=normalizeJob(storedJob);
    setMyJobs(function(p){return p.concat([localJob]);});
    updateSharedState(function(state){
      if(sb && createdRow && createdRow.id){
        state.jobOverrides[createdRow.id] = Object.assign({}, state.jobOverrides[createdRow.id] || {}, jobViewData, { co:biz.co, employerOwnerId:props.user.uid, verificationStatus:biz.verificationStatus || "pending", iconKey:"star", clr:"#F59E0B", posted:"Today", deadline:getDefaultDeadline(newJobId) });
      } else {
        state.customJobs = (state.customJobs || []).filter(function(job){ return String(job.id) !== String(storedJob.id); }).concat([storedJob]);
      }
      return state;
    });
    setSharedTick(function(t){ return t+1; });
    setShowAdd(false);setNj(createEmptyJobDraft());
    props.show("Job posted! Success");
  }

  async function saveBizProfile(){
    if(sb&&props.user){
      var res = await dbSaveEmployerProfile(props.user.uid, bd);
      if(res.error){props.show("Error: "+res.error,"err");return;}
    }
    var nextBiz = Object.assign({}, bd);
    setBiz(nextBiz);
    setEditB(false);
    updateSharedState(function(state){
      state.employerProfiles[props.user.uid || "demo-biz"] = Object.assign({}, nextBiz, { verificationStatus: nextBiz.verificationStatus || biz.verificationStatus || "pending" });
      return state;
    });
    props.show("Updated! Success");
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
            <HeaderBell open={bellOpen} onToggle={function(){setBellOpen(!bellOpen);}} onClose={function(){setBellOpen(false);}} notifications={notifications} onMarkRead={function(){markNotificationsRead(props.user.uid || "demo-biz","business");setSharedTick(function(t){return t+1;});}} onJump={function(note){setBellOpen(false);if(note.nav) setNav(note.nav);}}/>
            <Btn ch="+ Post New Job" v="or" sm sx={{background:OR,color:"#000"}} onClick={openCreateJob}/>
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
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><p style={{color:MU,fontSize:13}}>{myJobs.length} listings for {biz.co}</p><Btn ch="+ Post New Job" v="or" sx={{background:OR,color:"#000"}} onClick={openCreateJob}/></div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>{myJobs.map(function(j){
              var a2=applicants.filter(function(a){return a.jobId===j.id||a.job_id===j.id;});
              var views = sharedState.jobViews[j.id] || 0;
              var conversion = views ? Math.round((a2.length / views) * 100) : 0;
              return <div key={j.id} style={bx({border:"1px solid "+j.clr+"33"})}>
                <div style={{display:"flex",gap:12}}>
                  <div style={{width:46,height:46,borderRadius:11,background:j.clr+"22",border:"1px solid "+j.clr+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{j.logo}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:6}}><div><h3 style={{fontFamily:FH,fontSize:14,fontWeight:800,color:"#fff",marginBottom:1}}>{j.title}</h3><p style={{color:MU,fontSize:12}}>{j.loc||j.location} - {j.sched||j.schedule}</p></div><div style={{display:"flex",gap:6}}><span style={pill(j.clr)}>{j.type}</span><span style={pill("#10B981")}>{j.pay}</span></div></div>
                    {j.qs&&j.qs.length>0&&<div style={{marginBottom:9}}><p style={{color:MU,fontSize:11,fontWeight:700,marginBottom:5}}>Custom Questions: {j.qs.length}</p><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{j.qs.map(function(q2,i){return <span key={i} style={pill(BL,"rgba(59,130,246,0.08)")} title={q2}>Q{i+1}: {q2.length>36?q2.slice(0,36)+"...":q2}</span>;})}</div></div>}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                      {[{l:"Applied",n:a2.length,c:BL},{l:"Pending",n:a2.filter(function(a){return a.status==="pending";}).length,c:WN},{l:"Open",n:j.spots||1,c:OR}].map(function(s){return <div key={s.l} style={{background:BG,borderRadius:9,padding:"8px 11px",border:"1px solid "+BR}}><p style={{color:s.c,fontFamily:FH,fontSize:18,fontWeight:800}}>{s.n}</p><p style={{color:MU,fontSize:11}}>{s.l}</p></div>;})}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:8}}>
                      {[{l:"Views",n:views,c:PR},{l:"Applied",n:a2.length,c:BL},{l:"Conversion",n:conversion+"%",c:"#10B981"}].map(function(s){return <div key={s.l} style={{background:"rgba(255,255,255,0.03)",borderRadius:9,padding:"8px 11px",border:"1px solid "+BR}}><p style={{color:s.c,fontFamily:FH,fontSize:18,fontWeight:800}}>{s.n}</p><p style={{color:MU,fontSize:11}}>{s.l}</p></div>;})}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:11,borderTop:"1px solid "+BR,paddingTop:11,flexWrap:"wrap"}}><Btn ch={"View Applicants ("+a2.length+")"} sm onClick={function(){setFj(String(j.id));setNav("applicants");}}/><Btn ch="Edit Post" v="subtle" sm onClick={function(){openEditJob(j);}}/><Btn ch="Delete Post" v="dn" sm onClick={function(){deleteJob(j);}}/></div>
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
              {selectedApps.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}><Btn ch={"Accept ("+selectedApps.length+")"} sm onClick={function(){bulkUpdate("accepted");}}/><Btn ch="Decline" v="dn" sm onClick={function(){bulkUpdate("declined");}}/><Btn ch="Move to Pending" v="subtle" sm onClick={function(){bulkUpdate("pending");}}/></div>}
            </div>
            {disp.length===0&&<p style={{color:MU,textAlign:"center",padding:"30px 0"}}>No applicants yet.</p>}
            <div style={{display:"flex",flexDirection:"column",gap:9}}>{disp.map(function(a){
              var j=myJobs.find(function(x){return x.id===a.jobId||x.id===a.job_id;});
              var isSel=selA&&selA.id===a.id;
              var scol=a.status==="pending"?WN:a.status==="accepted"?"#10B981":DN;
              return <div key={a.id} className="jc" onClick={function(){setSelA(isSel?null:a);}} style={bx({border:"1px solid "+(isSel?OR+"66":BR)})}>
                <div style={{display:"flex",gap:11}}>
                  <input type="checkbox" checked={selectedApps.includes(a.id)} onChange={function(e){e.stopPropagation();setSelectedApps(function(prev){return prev.includes(a.id)?prev.filter(function(id){return id!==a.id;}):prev.concat([a.id]);});}} style={{marginTop:12}}/>
                  <div style={{width:42,height:42,borderRadius:11,background:OR+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0}}><FaUser /></div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                      <div><p style={{color:"#fff",fontWeight:800,fontSize:13,fontFamily:FH}}>{a.name}</p><p style={{color:MU,fontSize:12}}>{a.school} - {a.grade} - Age {a.age}</p></div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><span onClick={function(e){e.stopPropagation();updateApplicantMeta(a.id,{starred:!a.starred});}} style={{cursor:"pointer",color:a.starred?WN:MU,fontSize:14}}><FaStar /></span><span onClick={function(e){e.stopPropagation();updateApplicantMeta(a.id,{flagged:!a.flagged});}} style={{cursor:"pointer",color:a.flagged?DN:MU,fontSize:14}}><FaFlag /></span>{a.iv&&<span style={pill(PR)}><FaCalendar style={{marginRight:4}}/> Interview Set</span>}<span style={pill(scol)}>{a.status}</span></div>
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:5,flexWrap:"wrap"}}><span style={{color:MU,fontSize:11}}>{j?j.title:""}</span><span style={{color:MU,fontSize:11}}>Applied: {a.applied}</span><span style={{color:MU,fontSize:11}}>{a.email}</span></div>
                    {a.note&&<p style={{color:"#ccc",fontSize:12,marginTop:7,padding:"7px 10px",background:BG,borderRadius:7}}>"{a.note}"</p>}
                  </div>
                </div>
                {isSel&&<div style={{marginTop:11,paddingTop:11,borderTop:"1px solid "+BR}}>
                  {a.ans&&Object.keys(a.ans).length>0&&<div style={bx({background:BG,marginBottom:10})}><p style={{color:BL,fontSize:11,fontWeight:800,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><FaStickyNote /> Applicant Answers</p>{Object.entries(a.ans).map(function(entry){return <div key={entry[0]} style={{marginBottom:8}}><p style={{color:MU,fontSize:11,fontWeight:700,marginBottom:2}}>{entry[0]}</p><p style={{color:"#D1D5DB",fontSize:12,lineHeight:1.6}}>{entry[1]}</p></div>;})}</div>}
                  <div style={bx({background:BG,marginBottom:10})}><p style={{color:OR,fontSize:11,fontWeight:800,marginBottom:6}}>Private Employer Notes</p><Txa v={a.employerNotes||""} onClick={function(e){e.stopPropagation();}} onChange={function(e){var val=e.target.value;updateApplicantMeta(a.id,{employerNotes:val});}} h={64} ph="Internal notes only your team can see..." /></div>
                  {a.iv&&a.iv.status==="requested_new_time"&&<div style={{background:"rgba(245,158,11,0.08)",border:"1px solid "+WN+"44",borderRadius:9,padding:"10px 12px",marginBottom:10}}><p style={{color:WN,fontSize:12,fontWeight:800}}>Student requested a different time</p><p style={{color:"#FDE68A",fontSize:11,marginTop:4}}>{a.iv.responseNote || "No note provided."}</p></div>}
                  <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                    <Btn ch={<><FaFileAlt style={{marginRight:4}}/> View Resume</>} v="subtle" sm onClick={function(e){e.stopPropagation();setShowRes(true);}}/>
                    {a.status!=="accepted"&&<Btn ch="Accept" sm onClick={function(e){e.stopPropagation();updStatus(a.id,"accepted");}}/>}
                    {a.status!=="declined"&&<Btn ch="Decline" v="dn" sm onClick={function(e){e.stopPropagation();updStatus(a.id,"declined");}}/>}
                    {a.status!=="pending"&&<Btn ch="Move to Pending" v="subtle" sm onClick={function(e){e.stopPropagation();updStatus(a.id,"pending");}}/>}
                    {a.status==="accepted"&&<Btn ch={<><FaCalendar style={{marginRight:4}}/>{a.iv?"Edit Interview":"Schedule Interview"}</>} v="subtle" sm sx={{background:PR+"22",color:PR,border:"1px solid "+PR+"44"}} onClick={function(e){e.stopPropagation();setShowIV(true);setIvDraft(a.iv||{date:"",time:"",loc:"",notes:""}); }}/>}
                  </div>
                  <ApplicationMessages role="business" messages={a.messages||[]} onSend={function(body){sendEmployerMessage(a.id, body);}} placeholder="Message this student in-app..." />
                </div>}
              </div>;
            })}</div>
          </div>}

          {nav==="interviews"&&<BizInterviewsView applicants={applicants} myJobs={myJobs}/>}

          {nav==="profile"&&<div style={{maxWidth:680}}>
            <div style={bx({marginBottom:14,display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"})}>
              <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,"+OR+",#FF3B80)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}><FaBuilding /></div>
              <div style={{flex:1}}><h2 style={{fontFamily:FH,fontSize:18,fontWeight:800,color:"#fff",marginBottom:2}}>{biz.co}</h2><p style={{color:MU,fontSize:12}}>{biz.ind} - {biz.size}</p><p style={{color:MU,fontSize:12,marginTop:2}}>{biz.about}</p></div>
              <Btn ch={editB?"Cancel":"Edit Profile"} v={editB?"subtle":"or"} sx={editB?{}:{background:OR,color:"#000"}} onClick={function(){setBd(Object.assign({},biz));setEditB(!editB);}}/>
            </div>
            {editB?<div style={bx()}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>{[["co","Company Name"],["nm","Your Name"],["email","Email"],["phone","Phone"],["addr","Address"],["web","Website"],["ind","Industry"],["size","Company Size"]].map(function(pair){return <div key={pair[0]}><Lbl t={pair[1].toUpperCase()}/><Inp v={bd[pair[0]]} onChange={function(e){var val=e.target.value;setBd(function(p){return Object.assign({},p,{[pair[0]]:val});});}}/></div>;})}</div>
              <div style={{marginBottom:14}}><Lbl t="ABOUT"/><Txa v={bd.about} onChange={function(e){var val=e.target.value;setBd(function(p){return Object.assign({},p,{about:val});});}} h={68}/></div>
              <div style={{display:"flex",gap:8}}><Btn ch="Save Changes" lg sx={{background:OR,color:"#000"}} onClick={saveBizProfile}/><Btn ch="Cancel" v="subtle" onClick={function(){setEditB(false);}}/></div>
            </div>:<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:13}}>
              <div style={bx()}><h3 style={{fontFamily:FH,fontSize:13,fontWeight:700,color:"#fff",marginBottom:11}}>Contact and Details</h3>{[["Company",biz.co],["Contact",biz.nm],["Email",biz.email],["Phone",biz.phone],["Address",biz.addr],["Website",biz.web]].map(function(pair){return <div key={pair[0]} style={{marginBottom:8}}><p style={{color:MU,fontSize:10,fontWeight:700}}>{pair[0]}</p><p style={{color:"#fff",fontSize:12,fontWeight:600}}>{pair[1]}</p></div>;})}</div>
              <div style={bx()}><Lbl t="INDUSTRY"/><p style={{color:"#fff",fontSize:13,fontWeight:600,marginBottom:9}}>{biz.ind}</p><Lbl t="SIZE"/><p style={{color:"#fff",fontSize:13,fontWeight:600,marginBottom:9}}>{biz.size}</p><Lbl t="ABOUT"/><p style={{color:MU,fontSize:12,lineHeight:1.7,marginBottom:12}}>{biz.about}</p><div style={{background:getVerificationBadge(biz.verificationStatus).bg,border:"1px solid "+getVerificationBadge(biz.verificationStatus).color+"33",borderRadius:9,padding:"9px 11px",marginBottom:10}}><p style={{color:getVerificationBadge(biz.verificationStatus).color,fontSize:11,fontWeight:800,marginBottom:2}}>{getVerificationBadge(biz.verificationStatus).text}</p><p style={{color:"#FED7AA",fontSize:11}}>{biz.verificationStatus==="approved"?"Students will see your green verified badge on your profile and job listings.":"Your business stays pending until reviewed manually in the Supabase dashboard."}</p></div>{biz.verificationStatus!=="approved"&&<div style={{background:(biz.emailDomainMatch?PR:WN)+"11",border:"1px solid "+(biz.emailDomainMatch?PR:WN)+"33",borderRadius:9,padding:"9px 11px"}}><p style={{color:biz.emailDomainMatch?PR:WN,fontSize:11,fontWeight:800,marginBottom:2}}>{biz.emailDomainMatch?"Email Matches Website Domain":"Manual Review Required"}</p><p style={{color:MU,fontSize:11}}>{biz.emailDomainMatch?"Your sign-up email appears to match your business website domain, which helps reviewers approve faster.":"Use a business email that matches your website domain to improve verification confidence."}</p></div>}</div>
            </div>}
          </div>}
        </div>
      </div>

      {showRes&&selA&&<Modal onClose={function(){setShowRes(false);}} w={600}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid "+BR,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><p style={{color:OR,fontSize:10,fontWeight:800,marginBottom:2}}>APPLICANT RESUME</p><h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff"}}>{selA.name}</h2></div>
          <Btn ch="Close" v="subtle" sm onClick={function(){setShowRes(false);}}/>
        </div>
        <div style={{padding:"14px 18px"}}>
          <div style={bx({background:BG,marginBottom:14})}><div style={{display:"flex",gap:14,flexWrap:"wrap"}}>{[["Name",selA.name],["School",selA.school],["Grade",selA.grade],["Age",selA.age],["Email",selA.email]].map(function(pair){return <div key={pair[0]}><p style={{color:MU,fontSize:10}}>{pair[0]}</p><p style={{color:"#fff",fontSize:12,fontWeight:700}}>{pair[1]}</p></div>;})}</div></div>
          {(selA.resumeUrl || (selA.resumeData && selA.resumeData.resumeUrl))&&<div style={{marginBottom:14}}>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <Btn ch={<><FaDownload style={{marginRight:4}}/> Open Original Resume</>} sm onClick={function(){window.open(selA.resumeUrl || (selA.resumeData && selA.resumeData.resumeUrl),"_blank");}}/>
            </div>
            <div style={{background:"#fff",borderRadius:12,overflow:"hidden",minHeight:420}}>
              <iframe title="Applicant Resume" src={getResumePreviewUrl(selA.resumeUrl || (selA.resumeData && selA.resumeData.resumeUrl))} style={{width:"100%",height:420,border:"none"}} />
            </div>
          </div>}
          <ResumeCard data={Object.assign({},createResumeData(selA.resumeData || {}),selA.resumeData || {},{firstName:(selA.resumeData&&selA.resumeData.firstName)||selA.name.split(" ")[0],lastName:(selA.resumeData&&selA.resumeData.lastName)||selA.name.split(" ").slice(1).join(" "),school:(selA.resumeData&&selA.resumeData.school)||selA.school,grade:(selA.resumeData&&selA.resumeData.grade)||selA.grade,email:(selA.resumeData&&selA.resumeData.email)||selA.email})} tid="classic"/>
        </div>
      </Modal>}

      {showIV&&selA&&<Modal onClose={function(){setShowIV(false);}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid "+BR,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><p style={{color:PR,fontSize:10,fontWeight:800,marginBottom:2}}>SCHEDULE INTERVIEW</p><h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff"}}>{selA.name}</h2></div>
          <Btn ch="X" v="subtle" sm onClick={function(){setShowIV(false);}}/>
        </div>
        <div style={{padding:"14px 18px 18px"}}>
          <p style={{color:MU,fontSize:13,marginBottom:14}}>The student will see this in their Interviews tab.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
            <div><Lbl t="DATE"/><Inp v={ivDraft.date} onChange={function(e){var val=e.target.value;setIvDraft(function(p){return Object.assign({},p,{date:val});});}} ph="Apr 15, 2026" tp="date"/></div>
            <div><Lbl t="TIME"/><Inp v={ivDraft.time} onChange={function(e){var val=e.target.value;setIvDraft(function(p){return Object.assign({},p,{time:val});});}} ph="2:00 PM" tp="time"/></div>
          </div>
          <div style={{marginBottom:9}}><Lbl t="LOCATION"/><Inp v={ivDraft.loc} onChange={function(e){var val=e.target.value;setIvDraft(function(p){return Object.assign({},p,{loc:val});});}} ph="e.g. 2817 Commerce St or Video Call"/></div>
          <div style={{marginBottom:14}}><Lbl t="NOTES FOR STUDENT (optional)"/><Txa v={ivDraft.notes} onChange={function(e){var val=e.target.value;setIvDraft(function(p){return Object.assign({},p,{notes:val});});}} ph="e.g. Bring your resume. Arrive 10 min early." h={64}/></div>
          <div style={{display:"flex",gap:8}}><Btn ch="Confirm Interview" lg sx={{flex:1,justifyContent:"center",background:PR,color:"#000"}} onClick={schedIV}/><Btn ch="Cancel" v="subtle" onClick={function(){setShowIV(false);}}/></div>
        </div>
      </Modal>}

      {showAdd&&<Modal onClose={function(){setShowAdd(false);setEditJobId(null);setNj(createEmptyJobDraft());}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid "+BR,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><p style={{color:OR,fontSize:10,fontWeight:800,marginBottom:2}}>{editJobId?"EDIT JOB POST":"NEW JOB POST"}</p><h2 style={{fontFamily:FH,fontSize:15,fontWeight:800,color:"#fff"}}>{editJobId?"Update":"Post a Job for"} {biz.co}</h2></div>
          <Btn ch="X" v="subtle" sm onClick={function(){setShowAdd(false);setEditJobId(null);setNj(createEmptyJobDraft());}}/>
        </div>
        <div style={{padding:"14px 18px 18px",maxHeight:"70vh",overflowY:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
            <div><Lbl t="JOB TITLE (required)"/><Inp v={nj.title} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{title:val});});}} ph="e.g. Barista Trainee"/></div>
            <div><Lbl t="JOB TYPE"/><select value={nj.type} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{type:val});});}} style={Object.assign({},INP,{cursor:"pointer"})}>{["Part-Time","Internship","Seasonal","Full-Time"].map(function(t){return <option key={t}>{t}</option>;})}</select></div>
            <div><Lbl t="PAY RATE (required)"/><Inp v={nj.pay} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{pay:val});});}} ph="e.g. $13/hr"/></div>
            <div><Lbl t="LOCATION"/><Inp v={nj.loc} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{loc:val});});}} ph="e.g. Uptown Dallas"/></div>
            <div><Lbl t="METRO AREA"/><select value={nj.areaLabel} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{areaLabel:val});});}} style={Object.assign({},INP,{cursor:"pointer"})}>{AREAS.map(function(area){return <option key={area.l} value={area.l}>{area.l}</option>;})}</select></div>
            <div><Lbl t="SCHEDULE"/><Inp v={nj.sched} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{sched:val});});}} ph="e.g. Weekends"/></div>
            <div><Lbl t="TRAINING PROVIDED"/><Inp v={nj.train} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{train:val});});}} ph="e.g. Full training"/></div>
            <div><Lbl t="OPEN SPOTS"/><Inp v={String(nj.spots||1)} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{spots:val});});}} ph="1" tp="number"/></div>
          </div>
          <div style={{marginBottom:12}}><Lbl t="DESCRIPTION (required)"/><Txa v={nj.desc} onChange={function(e){var val=e.target.value;setNj(function(p){return Object.assign({},p,{desc:val});});}} ph="Describe the role..." h={72}/></div>
          <div style={{marginBottom:14}}>
            <Lbl t="STUDENT-SIDE FILTER TAGS"/>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {JOB_FILTER_TAGS.map(function(tag){
                var active = (nj.tags || []).includes(tag);
                return <span key={tag} className="ni" onClick={function(){setNj(function(prev){return Object.assign({},prev,{tags:active?prev.tags.filter(function(entry){return entry!==tag;}):prev.tags.concat([tag])});});}} style={{background:active?OR+"22":"rgba(255,255,255,0.05)",border:"1px solid "+(active?OR+"55":BR),borderRadius:999,padding:"6px 10px",fontSize:11,color:active?OR:MU,cursor:"pointer",fontWeight:700}}>{active?"✓ ":""}{tag}</span>;
              })}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}><Lbl t="CUSTOM QUESTIONS FOR APPLICANTS"/><Btn ch="+ Add" v="subtle" sm onClick={function(){setNj(function(p){return Object.assign({},p,{qs:p.qs.concat([""])});});}}/></div>
            {nj.qs.map(function(q2,i){return <div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}><span style={{width:18,height:18,borderRadius:5,background:BL+"22",border:"1px solid "+BL+"44",display:"flex",alignItems:"center",justifyContent:"center",color:BL,fontSize:9,fontWeight:800,flexShrink:0}}>Q{i+1}</span><Inp v={q2} onChange={function(e){var val=e.target.value;setNj(function(p){var qs2=p.qs.slice();qs2[i]=val;return Object.assign({},p,{qs:qs2});});}} ph={"Question "+(i+1)+"..."} sx={{flex:1}}/>{nj.qs.length>1&&<span className="hov" onClick={function(){setNj(function(p){return Object.assign({},p,{qs:p.qs.filter(function(_,j2){return j2!==i;})});});}} style={{color:DN,fontSize:16,cursor:"pointer",padding:4}}>x</span>}</div>;})}
          </div>
          <div style={{display:"flex",gap:8}}><Btn ch={editJobId?"Save Job Changes":"Post Job Listing"} lg sx={{flex:1,justifyContent:"center",background:OR,color:"#000"}} onClick={addJob}/><Btn ch="Cancel" v="subtle" onClick={function(){setShowAdd(false);setEditJobId(null);setNj(createEmptyJobDraft());}}/></div>
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
