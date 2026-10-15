'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { activities, adminCompetitions, dimensionMeta, teamLeaderboard, type Dimension } from '../prototype-data';
import { DimensionIcon, Icon, Logo } from '../ui';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

type AdminView = 'Overview' | 'Competitions' | 'Activity Library' | 'Templates';
type AdminCompetition = typeof adminCompetitions[number];

export default function AdminDashboard() {
  const supabase=getSupabaseBrowserClient();
  const [authStatus,setAuthStatus]=useState<'loading'|'signed-out'|'signed-in'>(supabase?'loading':'signed-out');
  const [view, setView] = useState<AdminView>('Overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<AdminCompetition | null>(null);
  const [toast, setToast] = useState('');
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400); };
  useEffect(()=>{
    if(!supabase)return;
    supabase.auth.getSession().then(({data})=>setAuthStatus(data.session?'signed-in':'signed-out'));
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>setAuthStatus(session?'signed-in':'signed-out'));
    return ()=>data.subscription.unsubscribe();
  },[supabase]);
  if(authStatus==='loading')return <AdminAuthShell><p className="admin-auth-status">Checking administrator access…</p></AdminAuthShell>;
  if(authStatus==='signed-out')return <AdminLogin/>;
  return <main className="admin-app">
    <aside className="admin-sidebar"><Logo/><nav>{([['Overview','grid'],['Competitions','trophy'],['Activity Library','target'],['Templates','book']] as const).map(([label,icon]) => <button key={label} className={view===label?'active':''} onClick={() => {setView(label);setSelected(null);}}><Icon name={icon}/>{label}</button>)}</nav><div className="admin-sidebar-footer"><Link href="/">← Student experience</Link><div><span>PF</span><p><strong>Pedro Falci</strong><small>Administrator</small></p></div><button className="admin-sign-out" onClick={()=>supabase?.auth.signOut()}>Sign out</button></div></aside>
    <section className="admin-main"><header className="admin-topbar"><div><span>Student Wellbeing workspace</span><strong>{selected?.name ?? view}</strong></div><div><button className="icon-button"><Icon name="search"/></button><button className="avatar-button">PF</button></div></header>
      <div className="admin-content">{selected ? <AdminCompetitionDetail competition={selected} onBack={() => setSelected(null)} notify={notify}/> : <>
        {view==='Overview'&&<Overview onCreate={()=>setCreateOpen(true)} onOpen={setSelected}/>} 
        {view==='Competitions'&&<Competitions onCreate={()=>setCreateOpen(true)} onOpen={setSelected}/>} 
        {view==='Activity Library'&&<ActivityLibrary notify={notify}/>} 
        {view==='Templates'&&<Templates/>}
      </>}</div>
    </section>
    {createOpen&&<CreateCompetition onClose={()=>setCreateOpen(false)} onCreated={(type)=>{setCreateOpen(false);setSelected({name:'New Well-Being Competition',type,status:'Scheduled',participants:0,activities:activities.length,dates:'Dates not set'});notify('Competition created');}}/>}
    {toast&&<div className="toast"><Icon name="check"/>{toast}</div>}
  </main>;
}

function AdminAuthShell({children}:{children:React.ReactNode}){return <main className="admin-auth-page"><section className="admin-auth-card"><Logo/>{children}<Link href="/">← Return to student experience</Link></section></main>}

function AdminLogin(){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [submitting,setSubmitting]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();const client=getSupabaseBrowserClient();if(!client){setError('Supabase is not configured.');return;}setSubmitting(true);setError('');const {error:loginError}=await client.auth.signInWithPassword({email,password});if(loginError){setError('Email or password is incorrect.');setSubmitting(false);}}
  return <AdminAuthShell><div className="admin-auth-heading"><span>ADMINISTRATOR ACCESS</span><h1>Sign in</h1><p>Use your approved Student Wellbeing administrator account.</p></div><form className="admin-login-form" onSubmit={submit}><label>Email address<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" required/></label><label>Password<input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" required/></label>{error&&<p className="admin-login-error">{error}</p>}<button className="primary-button" disabled={submitting}>{submitting?'Signing in…':'Sign in'}</button></form></AdminAuthShell>
}

function Overview({onCreate,onOpen}:{onCreate:()=>void;onOpen:(item:AdminCompetition)=>void}) {
  return <><AdminHeading eyebrow="" title="Overview"/><button className="admin-create-callout" onClick={onCreate}><span><strong>Create New Competition</strong><small>Set the competition basics and choose activities.</small></span><Icon name="plus" size={34}/></button><div className="list-heading"><h2>Existing Competitions</h2><span>{adminCompetitions.length} competitions</span></div><div className="admin-competition-cards">{adminCompetitions.map(item=><button key={item.name} onClick={()=>onOpen(item)}><div><span className={`large-status ${item.status.toLowerCase()}`}>{item.status}</span><Icon name="chevron"/></div><h2>{item.name}</h2><p>{item.type} competition</p><footer>{item.dates}</footer></button>)}</div></>;
}

function Competitions({onCreate,onOpen}:{onCreate:()=>void;onOpen:(item:AdminCompetition)=>void}) {
  const [filter,setFilter]=useState('All');
  const items=filter==='All'?adminCompetitions:adminCompetitions.filter((item)=>item.status===filter);
  return <><AdminHeading eyebrow="MANAGE" title="Competitions" text="Create, organize, and monitor every well-being competition." action="Create competition" onAction={onCreate}/><div className="admin-toolbar"><div className="tabs">{['All','Active','Scheduled'].map(item=><button className={filter===item?'active':''} key={item} onClick={()=>setFilter(item)}>{item}<span>{item==='All'?adminCompetitions.length:adminCompetitions.filter(c=>c.status===item).length}</span></button>)}</div><label className="admin-search"><Icon name="search" size={17}/><input placeholder="Search competitions"/></label></div><section className="panel no-pad"><AdminCompetitionTable items={items} onOpen={onOpen}/></section></>;
}

const defaultRules=`Competition rules:

1. Complete activities honestly and only during the competition period.
2. Respect other participants, Boston University property, and all University policies.
3. Never complete an activity in a private, restricted, or unsafe area.
4. Group members may complete assigned activities together unless an activity says otherwise.
5. Points and leaderboard positions are part of a friendly wellbeing challenge. Administrators may review unusual activity before confirming results.`;
const defaultDisclaimer=`Well-Being Challenge — Participation Acknowledgment

Participation is voluntary. Activities are intended to encourage healthy routines and community connection; they do not replace medical, mental health, nutritional, or financial advice.

Participants are responsible for making safe choices, considering their individual needs and abilities, and stopping any activity that causes pain, distress, or discomfort. No activity requires entering a restricted area, sharing private information, or taking an unreasonable risk.

Competition participation, activity completions, team membership, and points may be stored and reviewed to administer the challenge. Final wording should be reviewed by the sponsoring Boston University office before publication.`;
const defaultInvitation=`You are invited to join a Boston University Well-Being Challenge.

Open the competition link or scan the QR code, review the participant rules and disclaimer, and then join as an individual or through your assigned team invitation. Complete activities, earn points, and follow your progress throughout the competition.`;

function Templates() {
  /* DESIGN DECISION: Platform defaults are copied into future competitions, then organizers may customize each competition independently. */
  /* PROTOTYPE: Edits remain in this browser session and demonstrate the intended save interaction. */
  /* TODO(PRODUCTION): Persist versioned platform defaults, record the administrator who changed them, and snapshot the current version when a competition is created. */
  return <><AdminHeading eyebrow="TEMPLATES" title="Default Templates" text="Manage the platform text copied into newly created well-being competitions."/><section className="template-hero"><span>PLATFORM DEFAULTS</span><h2>Templates for future competitions</h2><p>When a new competition is started, the current templates are copied into it. The organizer may then customize that competition independently.</p></section><section className="template-warning"><strong>⚠ Changes apply only to future competitions</strong><p>Existing competitions keep the text saved when they were created. Editing an individual competition will not change these platform defaults.</p></section><div className="default-template-list"><EditableTemplate title="Participant Rules" description="Default participant rules copied into every newly created competition." initialValue={defaultRules}/><EditableTemplate title="Participant Disclaimer" description="Default acknowledgment students must accept before joining." initialValue={defaultDisclaimer}/><EditableTemplate title="Invitation Message" description="Default guidance shown beside invitation links and QR codes." initialValue={defaultInvitation}/></div></>;
}

function EditableTemplate({title,description,initialValue}:{title:string;description:string;initialValue:string}) {
  const [value,setValue]=useState(initialValue); const [draft,setDraft]=useState(initialValue); const [editing,setEditing]=useState(false); const [saved,setSaved]=useState(false);
  return <section className="default-template-card"><header><div><Icon name="book"/><span><h3>{title}</h3><p>{description}</p></span></div>{editing?<div><button className="secondary-button" onClick={()=>{setDraft(value);setEditing(false)}}>Cancel</button><button className="primary-button" onClick={()=>{setValue(draft);setEditing(false);setSaved(true);window.setTimeout(()=>setSaved(false),2000)}}>Save Template</button></div>:<button className="secondary-button" onClick={()=>setEditing(true)}>Edit</button>}</header>{editing?<textarea value={draft} onChange={event=>setDraft(event.target.value)}/>:<div className="template-copy">{value}</div>}{saved&&<span className="template-saved"><Icon name="check" size={15}/>Saved for future competitions</span>}</section>;
}

function AdminCompetitionTable({items,onOpen}:{items:AdminCompetition[];onOpen:(item:AdminCompetition)=>void}) {
  return <div className="admin-table"><div className="admin-table-head"><span>Competition</span><span>Type</span><span>Status</span><span>Participants</span><span>Dates</span><span/></div>{items.map(item=><button className="admin-table-row" key={item.name} onClick={()=>onOpen(item)}><div><span className="table-mark"><Icon name={item.type==='Group'?'users':'user'} size={18}/></span><p><strong>{item.name}</strong><small>{item.activities} activities</small></p></div><span>{item.type}</span><span><i className={`status ${item.status.toLowerCase()}`}/>{item.status}</span><strong>{item.participants.toLocaleString()}</strong><span>{item.dates}</span><Icon name="chevron" size={18}/></button>)}</div>;
}

function AdminCompetitionDetail({competition,onBack,notify}:{competition:AdminCompetition;onBack:()=>void;notify:(m:string)=>void}) {
  const [tab,setTab]=useState<'Overview'|'Participants'|'Teams'|'Activities'|'Leaderboard'>('Overview');
  const tabs=(competition.type==='Group'?['Overview','Activities','Teams','Participants','Leaderboard']:['Overview','Activities','Participants','Leaderboard']) as Array<'Overview'|'Participants'|'Teams'|'Activities'|'Leaderboard'>;
  /* DESIGN DECISION: Competition setup stops after Basics and Activities; operational work such as team creation belongs on this management page, matching Terrier Pursuit's event-first workflow. */
  /* PROTOTYPE: Tabs, counts, members, links, and leaderboard updates are held in local component state or mock data. */
  /* TODO(PRODUCTION): Load the competition and permission-scoped tabs from the backend, persist edits, and enforce that individual competitions cannot create teams. */
  return <><button className="admin-back" onClick={onBack}>← Back to competitions</button><div className="admin-detail-heading"><div><span className={`large-status ${competition.status.toLowerCase()}`}>{competition.status}</span><h1>{competition.name}</h1><p>{competition.type} competition · {competition.dates}</p></div><button className="secondary-button">Edit competition</button></div><div className="detail-tabs">{tabs.map(item=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{competition.type==='Group'&&item==='Teams'?'Team Assignment':competition.type==='Group'&&item==='Participants'?'Participants & Teams':item}</button>)}</div>{tab==='Overview'&&<CompetitionOverview competition={competition} onTeams={()=>setTab('Teams')}/>} {tab==='Activities'&&<AssignedActivities notify={notify}/>} {tab==='Teams'&&competition.type==='Group'&&<TeamManager notify={notify}/>} {tab==='Participants'&&<CompetitionParticipants grouped={competition.type==='Group'}/>} {tab==='Leaderboard'&&<AdminLeaderboard/>}</>;
}

function CompetitionOverview({competition,onTeams}:{competition:AdminCompetition;onTeams:()=>void}) {
  return <><div className="event-metrics"><article><Icon name="users"/><strong>{competition.participants}</strong><span>Registered Students</span></article><article><Icon name="trophy"/><strong>{competition.type==='Group'?'3':'—'}</strong><span>Teams</span></article><button onClick={competition.type==='Group'?onTeams:undefined}><Icon name="user"/><strong>{competition.type==='Group'?'7':'0'}</strong><span>Unassigned Students</span>{competition.type==='Group'&&<b>View list</b>}</button><button><Icon name="clock"/><strong>104</strong><span>Completed Activities</span><b>View activity</b></button></div><section className="event-band"><div><small>COMPETITION TYPE</small><strong>{competition.type}</strong></div><div><small>COMPETITION DATES</small><strong>{competition.dates}</strong></div><div><small>ACTIVITIES</small><strong>{competition.activities} assigned</strong></div><button>Edit Competition</button></section><div className="event-accordions"><details><summary><Icon name="qr"/>Participant QR Code <span>⌄</span></summary><p>Students scan this competition code to open registration. Team invitations remain team-specific.</p></details><details><summary><Icon name="book"/>Competition Instructions <span>⌄</span></summary><p>Complete assigned activities during the competition period and follow Boston University community guidelines.</p></details><details><summary><Icon name="link"/>Participant Invitation Link <span>⌄</span></summary><p>wellbeing.bu.edu/join/fall-wellbeing</p></details></div></>;
}

function TeamManager({notify}:{notify:(m:string)=>void}) {
  const [teams,setTeams]=useState([{name:'Towers 4th Floor',members:['Maya Rodriguez','Jordan Lee','Alex Turner']},{name:'Myles 3rd Floor',members:['Dannar Zharkyn','Sam Kim']},{name:'Warren A8',members:['Taylor Moore','Jamie Chen','Morgan Reed']}]);
  const initialStudents=[
    {name:'Avery Brooks',email:'abrooks@bu.edu',role:'Unspecified role'},
    {name:'Nora Patel',email:'npatel@bu.edu',role:'Peer mentor'},
    {name:'Chris Park',email:'cpark@bu.edu',role:'Unspecified role'},
    {name:'Elena Rivera',email:'erivera@bu.edu',role:'Unspecified role'},
    {name:'Malik Thompson',email:'mthomp@bu.edu',role:'Resident assistant'},
    {name:'Sofia Chen',email:'schen@bu.edu',role:'Unspecified role'},
    {name:'Theo Martin',email:'tmartin@bu.edu',role:'Unspecified role'},
  ];
  const [unassigned,setUnassigned]=useState(initialStudents);
  const [selectedStudent,setSelectedStudent]=useState(initialStudents[0]?.name??'');
  const [mode,setMode]=useState<'random'|'role'>('random');
  const [teamSize,setTeamSize]=useState(5);
  const [leaders,setLeaders]=useState<string[]>([]);
  const [newTeamName,setNewTeamName]=useState('');
  const student=unassigned.find(item=>item.name===selectedStudent)??unassigned[0];
  /* DESIGN DECISION: Bulk assignment and manual assignment share one page, matching Terrier Pursuit so organizers can start automatically and still resolve individual exceptions. */
  /* PROTOTYPE: Assignment, team creation, leader designation, and balancing run only in local component state. */
  /* TODO(PRODUCTION): Perform assignment atomically on the backend, respect participant roles and locked memberships, generate unique team codes, and record reversible audit events. */
  const assignToTeam=(index:number)=>{if(!student)return;setTeams(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,members:[...item.members,student.name]}:item));setUnassigned(current=>current.filter(item=>item.name!==student.name));setSelectedStudent('');notify(`${student.name} assigned to ${teams[index].name}`);};
  const createTeam=()=>{if(!newTeamName.trim())return;const member=student?.name;setTeams(current=>[...current,{name:newTeamName.trim(),members:member?[member]:[]}]);if(member)setUnassigned(current=>current.filter(item=>item.name!==member));setSelectedStudent('');setNewTeamName('');notify('Team created');};
  const assignEveryone=()=>{if(!unassigned.length)return;const count=Math.ceil(unassigned.length/teamSize);const generated=Array.from({length:count},(_,index)=>({name:`Wellbeing Team ${teams.length+index+1}`,members:[] as string[]}));unassigned.forEach((person,index)=>generated[index%count].members.push(person.name));setTeams(current=>[...current,...generated]);setUnassigned([]);setSelectedStudent('');notify(`${unassigned.length} students assigned across ${count} teams`);};
  const unassignEveryone=()=>{const restored=teams.flatMap(item=>item.members.map(name=>({name,email:`${name.toLowerCase().replaceAll(' ','.')}@bu.edu`,role:'Unspecified role'})));setUnassigned(restored);setTeams(current=>current.map(item=>({...item,members:[]})));setSelectedStudent(restored[0]?.name??'');notify('All students moved to the waiting list');};
  return <><div className="subpage-heading"><div><h2>Team Assignment</h2><p>Automatically balance the waiting list or assign each participant manually.</p></div></div><section className="auto-assignment"><header><Icon name="spark"/><div><h3>Automatic Team Assignment</h3><p>Assign the entire waiting list at once. Existing team memberships stay unchanged.</p></div></header><div className="auto-assignment-body"><div className="assignment-modes"><button className={mode==='random'?'active':''} onClick={()=>setMode('random')}><i/><span><strong>Random and balanced</strong><small>Shuffle everyone and keep team sizes as even as possible.</small></span></button><button className={mode==='role'?'active':''} onClick={()=>setMode('role')}><i/><span><strong>Balance by role</strong><small>Create teams with one preferred or organizer-designated leader per team.</small></span></button></div><div className="assignment-controls"><label>Target team size<input type="number" min="2" max="12" value={teamSize} onChange={event=>setTeamSize(Math.max(2,Number(event.target.value)||2))}/></label><button className="primary-button" disabled={!unassigned.length} onClick={assignEveryone}><Icon name="move"/> Assign Everyone</button><button className="secondary-button danger" onClick={unassignEveryone}>↶ Unassign Everyone</button></div></div><footer><span><strong>{unassigned.length}</strong> waiting</span><span><strong>{Math.ceil(unassigned.length/teamSize)}</strong> teams needed</span><span><strong>{unassigned.filter(item=>item.role!=='Unspecified role').length}</strong> preferred leaders</span><span><strong>{leaders.length}</strong> designated leaders</span><span><strong>{unassigned.filter(item=>item.role==='Unspecified role').length}</strong> others</span></footer></section><div className="manual-assignment"><section className="waiting-list"><header><h3>Unassigned List</h3><p>Select a participant, then choose their team.</p></header>{unassigned.length?unassigned.map(item=><button className={student?.name===item.name?'active':''} key={item.name} onClick={()=>setSelectedStudent(item.name)}><strong>{item.name}</strong><span>{item.email}</span><small>{item.role}</small></button>):<div className="empty-waiting">Everyone has been assigned.</div>}</section><section className="participant-assignment">{student?<><header><div><span>SELECTED PARTICIPANT</span><h3>{student.name}</h3><p>{student.email}</p><small>{student.role}</small></div><button className={leaders.includes(student.name)?'leader active':'leader'} onClick={()=>setLeaders(current=>current.includes(student.name)?current.filter(name=>name!==student.name):[...current,student.name])}>{leaders.includes(student.name)?'✓ Designated Leader':'☆ Designate as Leader'}</button></header><div className="assignment-destinations"><article className="create-team-card"><Icon name="plus"/><h4>Create New Team</h4><p>Give the team a name. A unique code will be generated automatically.</p><label>Team Name<input value={newTeamName} onChange={event=>setNewTeamName(event.target.value)} placeholder="Kenmore Crawlers"/></label><button className="primary-button" disabled={!newTeamName.trim()} onClick={createTeam}>Create Team</button></article>{teams.map((item,index)=><article className="assignment-team-card" key={`${item.name}-${index}`}><div><h4>{item.name}</h4><span><Icon name="users" size={15}/>{item.members.length}</span></div><p>{item.members.length} members</p><small>TEAM CODE</small><strong>{item.name.replace(/[^A-Z0-9]/gi,'').slice(0,6).toUpperCase().padEnd(6,'X')}</strong><button className="primary-button" onClick={()=>assignToTeam(index)}><Icon name="users" size={16}/> Assign to This Team</button></article>)}</div></>:<div className="empty-selection"><Icon name="check" size={34}/><h3>All participants assigned</h3><p>Use “Unassign Everyone” to make changes.</p></div>}</section></div></>;
}

function CompetitionParticipants({grouped}:{grouped:boolean}) {
  const people=[
    {name:'Maya Rodriguez',team:'Towers 4th Floor',points:420,activityIds:[1,3,5,11]},
    {name:'Jordan Lee',team:'Towers 4th Floor',points:360,activityIds:[2,4,9]},
    {name:'Alex Turner',team:'Towers 4th Floor',points:280,activityIds:[3,7,13]},
    {name:'Dannar Zharkyn',team:'Myles 3rd Floor',points:410,activityIds:[3,11,13]},
    {name:'Sam Kim',team:'Myles 3rd Floor',points:330,activityIds:[1,6,12]},
  ];
  const [selected,setSelected]=useState(people[0]);
  /* DESIGN DECISION: Activity-level completion is visible only to administrators; student teammates receive aggregate point contributions only. */
  /* PROTOTYPE: Participant records and completed activities are mock data selected in local component state. */
  /* TODO(PRODUCTION): Load permission-scoped completion records from the backend and audit administrator access. */
  return <><div className="subpage-heading"><div><h2>Participants & Teams</h2><p>Select a participant to review their completed activities.</p></div></div><div className="admin-participant-workspace"><section className="participant-directory"><header><strong>Registered students</strong><span>{people.length} participants</span></header>{people.map(person=><button key={person.name} className={selected.name===person.name?'active':''} onClick={()=>setSelected(person)}><span>{person.name.split(' ').map(part=>part[0]).join('')}</span><div><strong>{person.name}</strong><small>{grouped?person.team:'Individual participant'}</small></div><b>{person.points} pts</b></button>)}</section><section className="participant-detail"><header><span>{selected.name.split(' ').map(part=>part[0]).join('')}</span><div><h3>{selected.name}</h3><p>{grouped?selected.team:'Individual competition'} · {selected.points} points</p></div></header><div className="participant-activity-summary"><strong>{selected.activityIds.length}</strong><span>activities completed</span></div><div className="participant-completions">{selected.activityIds.map(id=>{const activity=activities.find(item=>item.id===id)!;return <article key={id}><DimensionIcon dimension={activity.dimension}/><div><h4>{activity.title}</h4><p>{activity.dimension} · {activity.type}</p></div><b>+{activity.points} pts</b><span>Completed</span></article>})}</div></section></div></>;
}

function AssignedActivities({notify}:{notify:(m:string)=>void}) { return <><div className="subpage-heading"><div><h2>Assigned activities</h2><p>12 activities are available in this competition.</p></div><button className="primary-button" onClick={()=>notify('Activity picker opened')}><Icon name="plus"/> Assign activities</button></div><section className="panel no-pad"><div className="activity-admin-table">{activities.slice(0,8).map(activity=><article key={activity.id}><DimensionIcon dimension={activity.dimension}/><div><h3>{activity.title}</h3><p>{activity.dimension} · {activity.type}{activity.type==='Timed'?` · ${activity.duration} minutes`:''}</p></div><strong>{activity.points} pts</strong><button>•••</button></article>)}</div></section></>; }
function AdminLeaderboard(){return <section className="panel"><PanelHeading title="Live team leaderboard" action="Export"/><div className="admin-leaderboard">{teamLeaderboard.map((team,index)=><article key={team.name}><strong>{index+1}</strong><span>{team.name.slice(0,2)}</span><div><h3>{team.name}</h3><p>{team.detail}</p></div><b>{team.points.toLocaleString()} pts</b></article>)}</div></section>;}

type LibraryActivity = { id:string; title:string; detail:string; dimension:Dimension; type:'Timed'|'Daily check-in'; duration:number; points:number };

function ActivityLibrary({notify}:{notify:(m:string)=>void}) {
  const fallback:LibraryActivity[]=activities.map(activity=>({...activity,id:String(activity.id)}));
  const supabase=getSupabaseBrowserClient();
  const [items,setItems]=useState<LibraryActivity[]>(fallback);
  const [dimension,setDimension]=useState<Dimension|'All'>('All');
  const [search,setSearch]=useState('');
  const [createOpen,setCreateOpen]=useState(false);
  const [editing,setEditing]=useState<LibraryActivity|null>(null);
  const [loading,setLoading]=useState(Boolean(supabase));
  const [loadError,setLoadError]=useState('');

  /* DESIGN DECISION: The central activity library is the source of truth; competitions will reference activity IDs rather than copying activity content. */
  /* PROTOTYPE: If Supabase environment variables are unavailable, the page falls back to the original in-memory activities so design review is never blocked. */
  /* TODO(PRODUCTION): Require authenticated administrator authorization before database writes and replace the temporary anonymous write policies. */
  useEffect(()=>{
    if(!supabase)return;
    supabase.from('activities').select('id,title,description,dimension,completion_type,duration_minutes,points').eq('is_active',true).order('created_at').then(({data,error})=>{
      if(error){setLoadError(error.message);setLoading(false);return;}
      setItems((data??[]).map(row=>({id:row.id,title:row.title,detail:row.description,dimension:row.dimension as Dimension,type:row.completion_type==='timed'?'Timed':'Daily check-in',duration:row.duration_minutes??0,points:row.points})));
      setLoading(false);
    });
  },[supabase]);

  const shown=items.filter(activity=>(dimension==='All'||activity.dimension===dimension)&&`${activity.title} ${activity.detail}`.toLowerCase().includes(search.trim().toLowerCase()));
  async function createActivity(input:Omit<LibraryActivity,'id'>){
    const client=getSupabaseBrowserClient();
    if(!client){setItems(current=>[...current,{...input,id:`local-${Date.now()}`}]);setCreateOpen(false);notify('Activity added locally');return;}
    const {data,error}=await client.from('activities').insert({title:input.title,description:input.detail,dimension:input.dimension,completion_type:input.type==='Timed'?'timed':'daily_check_in',duration_minutes:input.type==='Timed'?input.duration:null,points:input.points}).select('id,title,description,dimension,completion_type,duration_minutes,points').single();
    if(error){notify(`Could not create activity: ${error.message}`);return;}
    setItems(current=>[...current,{id:data.id,title:data.title,detail:data.description,dimension:data.dimension as Dimension,type:data.completion_type==='timed'?'Timed':'Daily check-in',duration:data.duration_minutes??0,points:data.points}]);
    setCreateOpen(false);notify('Activity created');
  }
  async function updateActivity(input:Omit<LibraryActivity,'id'>){
    if(!editing)return;
    const client=getSupabaseBrowserClient();
    if(client&&!editing.id.startsWith('local-')){
      const {error}=await client.from('activities').update({title:input.title,description:input.detail,dimension:input.dimension,completion_type:input.type==='Timed'?'timed':'daily_check_in',duration_minutes:input.type==='Timed'?input.duration:null,points:input.points,updated_at:new Date().toISOString()}).eq('id',editing.id);
      if(error){notify(`Could not update activity: ${error.message}`);return;}
    }
    setItems(current=>current.map(item=>item.id===editing.id?{...input,id:editing.id}:item));
    setEditing(null);notify('Activity updated');
  }
  async function archiveActivity(activity:LibraryActivity){
    if(!window.confirm(`Remove “${activity.title}” from the activity library?`))return;
    const client=getSupabaseBrowserClient();
    if(client&&!activity.id.startsWith('local-')){const {error}=await client.rpc('archive_activity',{activity_id:activity.id});if(error){notify(`Could not remove activity: ${error.message}`);return;}}
    setItems(current=>current.filter(item=>item.id!==activity.id));notify('Activity removed');
  }
  return <><AdminHeading eyebrow="CONTENT" title="Activity library" text="Manage reusable activities across every competition." action="Create activity" onAction={()=>setCreateOpen(true)}/>{loadError&&<div className="library-error">Database unavailable: showing the local prototype library.</div>}<div className="library-layout"><aside className="library-filters"><strong>Dimensions</strong><button className={dimension==='All'?'active':''} onClick={()=>setDimension('All')}>All activities <span>{items.length}</span></button>{(Object.keys(dimensionMeta) as Dimension[]).map(item=><button className={dimension===item?'active':''} key={item} onClick={()=>setDimension(item)}><DimensionIcon dimension={item} size="sm"/>{item}<span>{items.filter(activity=>activity.dimension===item).length}</span></button>)}</aside><section className="panel no-pad"><div className="library-top"><label className="admin-search"><Icon name="search" size={17}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search activities"/></label><button>Timed & check-in</button></div><div className="activity-admin-table">{loading?<div className="library-empty">Loading activities…</div>:shown.length?shown.map(activity=><article key={activity.id}><DimensionIcon dimension={activity.dimension}/><div><h3>{activity.title}</h3><p className="activity-description">{activity.detail||'No description yet.'}</p><p>{activity.dimension} · {activity.type}{activity.type==='Timed'?` · ${activity.duration} minutes`:''}</p></div><strong>{activity.points} pts</strong><div className="activity-row-actions"><button className="activity-edit" aria-label={`Edit ${activity.title}`} onClick={()=>setEditing(activity)}><Icon name="edit" size={18}/></button><button className="activity-delete" aria-label={`Delete ${activity.title}`} onClick={()=>archiveActivity(activity)}><Icon name="trash" size={18}/></button></div></article>):<div className="library-empty">No activities found.</div>}</div></section></div>{createOpen&&<ActivityModal onClose={()=>setCreateOpen(false)} onSave={createActivity}/>} {editing&&<ActivityModal activity={editing} onClose={()=>setEditing(null)} onSave={updateActivity}/>}</>;
}

function ActivityModal({activity,onClose,onSave}:{activity?:LibraryActivity;onClose:()=>void;onSave:(activity:Omit<LibraryActivity,'id'>)=>void}){
  const [title,setTitle]=useState(activity?.title??''); const [detail,setDetail]=useState(activity?.detail??''); const [dimension,setDimension]=useState<Dimension>(activity?.dimension??'Environmental'); const [type,setType]=useState<'Timed'|'Daily check-in'>(activity?.type??'Daily check-in'); const [points,setPoints]=useState(activity?.points??30); const [duration,setDuration]=useState(activity?.duration||10);
  const valid=title.trim().length>=2&&detail.trim().length>=4&&points>0&&(type==='Daily check-in'||duration>0);
  return <div className="modal-backdrop admin-modal-wrap" onMouseDown={onClose}><section className="create-modal activity-create-modal" onMouseDown={event=>event.stopPropagation()}><header><div><span>ACTIVITY LIBRARY</span><h2>{activity?'Edit activity':'Create activity'}</h2><p>{activity?'Clarify what students should do and how it is completed.':'Add a reusable activity to the central library.'}</p></div><button onClick={onClose}><Icon name="close"/></button></header><div className="form-body"><label>Activity title<input value={title} onChange={event=>setTitle(event.target.value)} placeholder="e.g. Take a mindful campus walk"/></label><label>Description<textarea value={detail} onChange={event=>setDetail(event.target.value)} placeholder="Explain clearly what the student should do."/><small>Required. This instruction is shown to students when they open the activity.</small></label><label>Well-being dimension<select value={dimension} onChange={event=>setDimension(event.target.value as Dimension)}>{(Object.keys(dimensionMeta) as Dimension[]).map(item=><option key={item}>{item}</option>)}</select></label><div className="activity-form-row"><label>Completion type<select value={type} onChange={event=>setType(event.target.value as 'Timed'|'Daily check-in')}><option>Daily check-in</option><option>Timed</option></select></label>{type==='Timed'&&<label>Duration (minutes)<input type="number" min="1" value={duration} onChange={event=>setDuration(Number(event.target.value))}/></label>}<label>Points<input type="number" min="1" value={points} onChange={event=>setPoints(Number(event.target.value))}/></label></div></div><footer><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!valid} onClick={()=>onSave({title:title.trim(),detail:detail.trim(),dimension,type,duration:type==='Timed'?duration:0,points})}>{activity?'Save Changes':'Create Activity'}</button></footer></section></div>;
}

/* DESIGN DECISION: Creation has only Basics and Activities. Team setup happens after creation, so organizers always manage memberships and invite links in the competition context. */
/* PROTOTYPE: Creating a competition constructs an in-memory record and immediately opens its management page. */
/* TODO(PRODUCTION): Validate both steps on the server, persist the competition and activity associations, then route to the new competition ID returned by the API. */
function CreateCompetition({onClose,onCreated}:{onClose:()=>void;onCreated:(type:'Individual'|'Group')=>void}) {
  const [step,setStep]=useState(1); const [type,setType]=useState<'Individual'|'Group'>('Group');
  /* DESIGN DECISION: Dates and times are collected together in Boston time so organizers see one unambiguous schedule, matching Terrier Pursuit. */
  /* PROTOTYPE: Rules, disclaimer, schedule, and AM/PM choices are visual form state and are not persisted. */
  /* TODO(PRODUCTION): Store timezone-aware timestamps and version accepted rule/disclaimer text with each participant record. */
  return <div className="modal-backdrop admin-modal-wrap" onMouseDown={onClose}><section className="create-modal" onMouseDown={event=>event.stopPropagation()}><header><div><span>NEW COMPETITION</span><h2>Create competition</h2><p>Set the basics, schedule, participant guidance, and activities.</p></div><button onClick={onClose}><Icon name="close"/></button></header><div className="stepper two-step"><span className="active">1 <small>Basics</small></span><i/><span className={step>=2?'active':''}>2 <small>Activities</small></span></div>{step===1&&<div className="form-body"><label>Competition name<input placeholder="e.g. Spring Well-Being Challenge"/></label><label>Description<textarea placeholder="What should students know about this competition?"/></label><div><span className="field-label">Competition type</span><div className="type-options"><button className={type==='Individual'?'active':''} onClick={()=>setType('Individual')}><Icon name="user"/><strong>Individual</strong><small>Students participate independently; no teams are created.</small></button><button className={type==='Group'?'active':''} onClick={()=>setType('Group')}><Icon name="users"/><strong>Group</strong><small>Create and invite teams from the management page.</small></button></div></div><div className="schedule-fields"><DateTimeField label="Start date and time (Boston time)"/><DateTimeField label="End date and time (Boston time)"/></div><label>Participant rules<textarea className="long-field" defaultValue={defaultRules}/><small>Copied from Templates. Students see these instructions before participating.</small></label><label>Participant disclaimer<textarea className="long-field" defaultValue={defaultDisclaimer}/><small>Copied from Templates. Students must accept this wording before entering.</small></label><label>Invitation message<textarea className="long-field" defaultValue={defaultInvitation}/><small>Copied from Templates and shown with competition invitation links.</small></label></div>}{step===2&&<ActivitySelectionStep/>}<footer><button className="secondary-button" onClick={()=>step===1?onClose():setStep(1)}>{step===1?'Cancel':'Back'}</button><button className="primary-button" onClick={()=>step===2?onCreated(type):setStep(2)}>{step===2?'Create Competition':'Continue'} <Icon name="arrow" size={17}/></button></footer></section></div>;
}

function DateTimeField({label}:{label:string}) {
  const [period,setPeriod]=useState<'AM'|'PM'>('AM');
  return <fieldset><legend>{label}</legend><div><input type="date"/><select defaultValue=""><option value="" disabled>Hour</option>{Array.from({length:12},(_,index)=><option key={index+1}>{index+1}</option>)}</select><select defaultValue=""><option value="" disabled>Min</option>{['00','05','10','15','20','25','30','35','40','45','50','55'].map(minute=><option key={minute}>{minute}</option>)}</select><span className="ampm"><button className={period==='AM'?'active':''} type="button" onClick={()=>setPeriod('AM')}>AM</button><button className={period==='PM'?'active':''} type="button" onClick={()=>setPeriod('PM')}>PM</button></span></div></fieldset>;
}

type ActivitySelectionMode = 'library' | 'csv' | 'combined';
const csvDimensions = ['Environmental','Social','Emotional','Financial','Intellectual','Spiritual','Physical'] as const;
const sampleCsv = `${csvDimensions.join(',')}\nCampus cleanup,Call a friend,Journal for five minutes,Review weekly spending,Read for pleasure,Practice gratitude,Take a short walk\nUse a reusable bottle,Share a meal,,,,Quiet reflection,Stretch for ten minutes`;

/* DESIGN DECISION: These three modes make the source of competition activities explicit: the curated library, a competition-specific CSV, or a deduplicated union of both. */
/* PROTOTYPE: CSV files are read and counted only in this browser session; selecting Continue does not persist the file or its activities. */
/* TODO(PRODUCTION): Upload the original file to a protected backend service, parse it with a standards-compliant CSV parser, create activity records, and persist competition-to-activity associations transactionally. */
/* TODO(PRODUCTION): Deduplicate on a normalized composite key of dimension + title (trim, Unicode/case normalization, and collapsed whitespace), while retaining source/audit metadata and defining update conflict rules. */
/* TODO(PRODUCTION): Server validation must require these seven headers exactly once, reject unknown/duplicate columns, malformed quoting, oversized files, unsafe content, and rows with more than seven cells; empty cells are intentionally ignored. */
function ActivitySelectionStep() {
  const [mode,setMode]=useState<ActivitySelectionMode>('library');
  const [csvKeys,setCsvKeys]=useState<string[]>([]);
  const [fileName,setFileName]=useState('');
  const [error,setError]=useState('');
  const normalize=(value:string)=>value.trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const libraryKeys=activities.map(activity=>`${activity.dimension}|${normalize(activity.title)}`);
  const count=mode==='library'?new Set(libraryKeys).size:mode==='csv'?csvKeys.length:new Set([...libraryKeys,...csvKeys]).size;

  async function validateCsv(file:File|undefined) {
    setError(''); setCsvKeys([]); setFileName(file?.name??'');
    if(!file)return;
    if(!file.name.toLowerCase().endsWith('.csv')){setError('Please choose a .csv file.');return;}
    const rows=(await file.text()).split(/\r?\n/).filter(row=>row.trim());
    const headers=(rows.shift()??'').split(',').map(cell=>cell.trim());
    if(headers.length!==csvDimensions.length||headers.some((header,index)=>header!==csvDimensions[index])){setError('The header row must contain the seven dimensions in the template order.');return;}
    const keys=new Set<string>();
    for(const row of rows){const cells=row.split(',');if(cells.length>csvDimensions.length){setError('A row contains more than seven columns. Check commas and use the template format.');return;}cells.forEach((cell,index)=>{if(cell.trim())keys.add(`${csvDimensions[index]}|${normalize(cell)}`);});}
    if(!keys.size){setError('The CSV does not contain any activities.');return;}
    setCsvKeys([...keys]);
  }

  return <div className="form-body activity-selection"><h3>Choose an activity source</h3><p>Select one source for this competition. You can change it later.</p><div className="activity-mode-cards"><button className={mode==='library'?'active':''} onClick={()=>setMode('library')}><Icon name="book"/><strong>Use All Existing Activities</strong><small>Include every activity from the central library.</small></button><button className={mode==='csv'?'active':''} onClick={()=>setMode('csv')}><Icon name="arrow"/><strong>Upload CSV</strong><small>Use only activities contained in your CSV.</small></button><button className={mode==='combined'?'active':''} onClick={()=>setMode('combined')}><Icon name="plus"/><strong>Combine Both</strong><small>Merge the library and CSV, removing duplicates.</small></button></div>{mode!=='library'&&<div className="csv-upload"><div><strong>Upload activity CSV</strong><span>Seven columns required, one for each well-being dimension.</span></div><label><input type="file" accept=".csv,text/csv" onChange={event=>validateCsv(event.target.files?.[0])}/><span>{fileName||'Choose CSV file'}</span></label><a download="wellbeing-activities-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsv)}`}>Download sample CSV template</a>{error&&<p className="csv-error">{error}</p>}{csvKeys.length>0&&<p className="csv-success"><Icon name="check" size={14}/>{csvKeys.length} valid CSV activities found</p>}</div>}<div className="activity-count"><Icon name="check"/><div><strong>{count} activities selected</strong><span>{mode==='combined'?'Duplicates are removed by title and dimension.':mode==='csv'?'From the uploaded CSV file.':'From the central Activity Library.'}</span></div></div></div>;
}

function AdminHeading({eyebrow,title,text,action,onAction}:{eyebrow:string;title:string;text?:string;action?:string;onAction?:()=>void}){return <header className="admin-heading"><div>{eyebrow&&<span>{eyebrow}</span>}<h1>{title}</h1>{text&&<p>{text}</p>}</div>{action&&<button className="primary-button" onClick={onAction}><Icon name="plus"/>{action}</button>}</header>}
function PanelHeading({title,action}:{title:string;action?:string}){return <header className="panel-heading"><h2>{title}</h2>{action&&<button>{action}</button>}</header>}
