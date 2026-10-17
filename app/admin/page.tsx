'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { activities, dimensionMeta, type Dimension } from '../prototype-data';
import { DimensionIcon, Icon, Logo } from '../ui';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

type AdminView = 'Main Panel' | 'Activity Library' | 'Templates';
type AdminCompetition = {id:string;name:string;type:'Individual'|'Group';status:'Active'|'Scheduled'|'Ended';participants:number;activities:number;dates:string;description?:string;code?:string;startAt?:string;endAt?:string};
function effectiveCompetitionStatus(start:string,end:string):AdminCompetition['status']{const now=Date.now();if(new Date(end).getTime()<=now)return 'Ended';if(new Date(start).getTime()<=now)return 'Active';return 'Scheduled';}

export default function AdminDashboard() {
  const supabase=getSupabaseBrowserClient();
  const [authStatus,setAuthStatus]=useState<'loading'|'signed-out'|'signed-in'>(supabase?'loading':'signed-out');
  const [view, setView] = useState<AdminView>('Main Panel');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<AdminCompetition | null>(null);
  const [competitions,setCompetitions]=useState<AdminCompetition[]>([]);
  const [competitionsLoading,setCompetitionsLoading]=useState(true);
  const [toast, setToast] = useState('');
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400); };
  useEffect(()=>{
    if(!supabase)return;
    supabase.auth.getSession().then(({data})=>setAuthStatus(data.session?'signed-in':'signed-out'));
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>setAuthStatus(session?'signed-in':'signed-out'));
    return ()=>data.subscription.unsubscribe();
  },[supabase]);
  useEffect(()=>{
    if(authStatus!=='signed-in'||!supabase)return;
    supabase.from('competitions').select('id,name,competition_type,status,start_at,end_at,description,competition_code,event_activities(count),participants(count)').order('created_at').then(({data})=>{
      if(data)setCompetitions(data.map(row=>({id:row.id,name:row.name,type:row.competition_type==='group'?'Group':'Individual',status:effectiveCompetitionStatus(row.start_at,row.end_at),participants:row.participants?.[0]?.count??0,activities:row.event_activities?.[0]?.count??0,dates:formatCompetitionDates(row.start_at,row.end_at),description:row.description,code:row.competition_code,startAt:row.start_at,endAt:row.end_at})));
      setCompetitionsLoading(false);
    });
  },[authStatus,supabase]);
  if(authStatus==='loading')return <AdminAuthShell><p className="admin-auth-status">Checking administrator access…</p></AdminAuthShell>;
  if(authStatus==='signed-out')return <AdminLogin/>;
  return <main className="admin-app">
    <aside className="admin-sidebar"><Logo/><nav>{([['Main Panel','grid'],['Activity Library','target'],['Templates','book']] as const).map(([label,icon]) => <button key={label} className={view===label?'active':''} onClick={() => {setView(label);setSelected(null);}}><Icon name={icon}/>{label}</button>)}</nav><div className="admin-sidebar-footer"><Link href="/">← Student experience</Link><div><span>PF</span><p><strong>Pedro Falci</strong><small>Administrator</small></p></div><button className="admin-sign-out" onClick={()=>supabase?.auth.signOut()}>Sign out</button></div></aside>
    <section className="admin-main"><header className="admin-topbar"><div><span>Student Wellbeing workspace</span><strong>{selected?.name ?? view}</strong></div><div><button className="icon-button"><Icon name="search"/></button><button className="avatar-button">PF</button></div></header>
      <div className="admin-content">{selected ? <AdminCompetitionDetail competition={selected} onBack={() => setSelected(null)} notify={notify} onUpdate={updated=>{setSelected(updated);setCompetitions(current=>current.map(item=>item.id===updated.id?updated:item));}}/> : <>
        {view==='Main Panel'&&<Overview competitions={competitions} loading={competitionsLoading} onCreate={()=>setCreateOpen(true)} onOpen={setSelected} onDelete={deleteCompetition}/>}
        {view==='Activity Library'&&<ActivityLibrary notify={notify}/>} 
        {view==='Templates'&&<Templates/>}
      </>}</div>
    </section>
    {createOpen&&<CreateCompetition onClose={()=>setCreateOpen(false)} onCreated={(competition)=>{setCreateOpen(false);setCompetitions(current=>[...current,competition]);setSelected(competition);notify('Competition created');}}/>}
    {toast&&<div className="toast"><Icon name="check"/>{toast}</div>}
  </main>;

  async function deleteCompetition(competition:AdminCompetition){
    if(!window.confirm(`Permanently delete “${competition.name}” and all of its related data?`))return;
    const client=getSupabaseBrowserClient();
    if(client&&!competition.id.startsWith('mock-')){const {error}=await client.rpc('delete_competition',{competition_id:competition.id});if(error){notify(`Could not delete competition: ${error.message}`);return;}}
    setCompetitions(current=>current.filter(item=>item.id!==competition.id));if(selected?.id===competition.id)setSelected(null);notify('Competition permanently deleted');
  }
}

function formatCompetitionDates(start:string,end:string){const options:Intl.DateTimeFormatOptions={month:'short',day:'numeric'};return `${new Date(start).toLocaleDateString('en-US',options)} – ${new Date(end).toLocaleDateString('en-US',options)}`}

function AdminAuthShell({children}:{children:React.ReactNode}){return <main className="admin-auth-page"><section className="admin-auth-card"><Logo/>{children}<Link href="/">← Return to student experience</Link></section></main>}

function AdminLogin(){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [submitting,setSubmitting]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();const client=getSupabaseBrowserClient();if(!client){setError('Supabase is not configured.');return;}setSubmitting(true);setError('');const {error:loginError}=await client.auth.signInWithPassword({email,password});if(loginError){setError('Email or password is incorrect.');setSubmitting(false);}}
  return <AdminAuthShell><div className="admin-auth-heading"><span>ADMINISTRATOR ACCESS</span><h1>Sign in</h1><p>Use your approved Student Wellbeing administrator account.</p></div><form className="admin-login-form" onSubmit={submit}><label>Email address<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="username" required/></label><label>Password<input type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" required/></label>{error&&<p className="admin-login-error">{error}</p>}<button className="primary-button" disabled={submitting}>{submitting?'Signing in…':'Sign in'}</button></form></AdminAuthShell>
}

function Overview({competitions,loading,onCreate,onOpen,onDelete}:{competitions:AdminCompetition[];loading:boolean;onCreate:()=>void;onOpen:(item:AdminCompetition)=>void;onDelete:(item:AdminCompetition)=>void}) {
  return <><AdminHeading eyebrow="" title="Main Panel"/><button className="admin-create-callout" onClick={onCreate}><span><strong>Create New Competition</strong><small>Set the competition basics and choose activities.</small></span><Icon name="plus" size={34}/></button><div className="list-heading"><h2>Existing Competitions</h2><span>{loading?'Loading…':`${competitions.length} competitions`}</span></div>{loading?<div className="competition-loading">Loading competitions…</div>:<div className="admin-competition-cards">{competitions.map(item=><article key={item.id}><button className="competition-card-open" onClick={()=>onOpen(item)}><div><span className={`large-status ${item.status.toLowerCase()}`}>{item.status}</span><Icon name="chevron"/></div><h2>{item.name}</h2><p>{item.type} competition · Code {item.code??'—'}</p><footer>{item.dates}</footer></button><button className="competition-delete" aria-label={`Delete ${item.name}`} onClick={()=>onDelete(item)}><Icon name="trash" size={18}/></button></article>)}</div>}</>;
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

function AdminCompetitionDetail({competition,onBack,notify,onUpdate}:{competition:AdminCompetition;onBack:()=>void;notify:(m:string)=>void;onUpdate:(competition:AdminCompetition)=>void}) {
  const [tab,setTab]=useState<'Overview'|'Participants'|'Teams'|'Activities'|'Leaderboard'>('Overview');
  const [editOpen,setEditOpen]=useState(false);
  const [activityRevision,setActivityRevision]=useState(0);
  const tabs=(competition.type==='Group'?['Overview','Activities','Teams','Participants','Leaderboard']:['Overview','Activities','Participants','Leaderboard']) as Array<'Overview'|'Participants'|'Teams'|'Activities'|'Leaderboard'>;
  /* DESIGN DECISION: Competition setup stops after Basics and Activities; operational work such as team creation belongs on this management page, matching Terrier Pursuit's event-first workflow. */
  /* PROTOTYPE: Tabs, counts, members, links, and leaderboard updates are held in local component state or mock data. */
  /* TODO(PRODUCTION): Load the competition and permission-scoped tabs from the backend, persist edits, and enforce that individual competitions cannot create teams. */
  return <><button className="admin-back" onClick={onBack}>← Back to Main Panel</button><div className="admin-detail-heading"><div><span className={`large-status ${competition.status.toLowerCase()}`}>{competition.status}</span><h1>{competition.name}</h1><p>{competition.type} competition · {competition.dates}</p></div><button className="secondary-button" onClick={()=>setEditOpen(true)}>Edit competition</button></div><div className="detail-tabs">{tabs.map(item=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{competition.type==='Group'&&item==='Teams'?'Team Assignment':competition.type==='Group'&&item==='Participants'?'Participants & Teams':item}</button>)}</div>{tab==='Overview'&&<CompetitionOverview competition={competition} onTeams={()=>setTab('Teams')} onEdit={()=>setEditOpen(true)}/>} {tab==='Activities'&&<AssignedActivities competitionId={competition.id} refreshKey={activityRevision}/>} {tab==='Teams'&&competition.type==='Group'&&<TeamManager notify={notify}/>} {tab==='Participants'&&<CompetitionParticipants competitionId={competition.id} grouped={competition.type==='Group'}/>} {tab==='Leaderboard'&&<AdminLeaderboard competitionId={competition.id} type={competition.type}/>} {editOpen&&<EditCompetition competition={competition} onClose={()=>setEditOpen(false)} onSaved={updated=>{onUpdate(updated);setActivityRevision(value=>value+1);setEditOpen(false);notify('Competition updated');}}/>}</>;
}

function CompetitionOverview({competition,onTeams,onEdit}:{competition:AdminCompetition;onTeams:()=>void;onEdit:()=>void}) {
  return <><div className="event-metrics"><article><Icon name="users"/><strong>{competition.participants}</strong><span>Registered Students</span></article><article><Icon name="trophy"/><strong>{competition.type==='Group'?'3':'—'}</strong><span>Teams</span></article><button onClick={competition.type==='Group'?onTeams:undefined}><Icon name="user"/><strong>{competition.type==='Group'?'7':'0'}</strong><span>Unassigned Students</span>{competition.type==='Group'&&<b>View list</b>}</button><button><Icon name="clock"/><strong>104</strong><span>Completed Activities</span><b>View activity</b></button></div><section className="event-band"><div><small>COMPETITION TYPE</small><strong>{competition.type}</strong></div><div><small>COMPETITION DATES</small><strong>{competition.dates}</strong></div><div><small>ACTIVITIES</small><strong>{competition.activities} assigned</strong></div><button onClick={onEdit}>Edit Competition</button></section><div className="event-accordions"><details><summary><Icon name="qr"/>Participant QR Code <span>⌄</span></summary><p>Students scan this competition code to open registration. Team invitations remain team-specific.</p></details><details><summary><Icon name="book"/>Competition Instructions <span>⌄</span></summary><p>Complete assigned activities during the competition period and follow Boston University community guidelines.</p></details><details><summary><Icon name="link"/>Participant Invitation Link <span>⌄</span></summary><p>wellbeing.bu.edu/join/fall-wellbeing</p></details></div></>;
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

type AdminParticipant={id:string;name:string;email:string;team:string;points:number;completions:Array<{id:string;title:string;dimension:Dimension;type:string;points:number}>};
function CompetitionParticipants({competitionId,grouped}:{competitionId:string;grouped:boolean}) {
  const [people,setPeople]=useState<AdminParticipant[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [loading,setLoading]=useState(true);
  const selected=people.find(person=>person.id===selectedId)??people[0];
  async function deleteParticipant(person:AdminParticipant){if(!window.confirm(`Permanently remove ${person.name} from this competition?`))return;const client=getSupabaseBrowserClient();if(!client)return;const {error}=await client.from('participants').delete().eq('id',person.id).eq('competition_id',competitionId);if(error)return;setPeople(current=>current.filter(item=>item.id!==person.id));setSelectedId(current=>current===person.id?'':current);}
  /* DESIGN DECISION: Activity-level completion is visible only to administrators; student teammates receive aggregate point contributions only. */
  /* PROTOTYPE: Students use a browser-held profile UUID until BU authentication replaces it. */
  /* TODO(PRODUCTION): Derive administrator authorization from server sessions and audit access to completion records. */
  useEffect(()=>{const client=getSupabaseBrowserClient();if(!client)return;client.from('participants').select('id,display_name,email,points,team_memberships(teams(name)),activity_completions(id,points_awarded,activities(title,dimension,completion_type))').eq('competition_id',competitionId).order('created_at').then(({data})=>{const mapped=(data??[]).map(raw=>{const row=raw as unknown as Record<string,unknown>;const memberships=Array.isArray(row.team_memberships)?row.team_memberships as Array<Record<string,unknown>>:[];const teams=memberships[0]?.teams;const teamRecord=(Array.isArray(teams)?teams[0]:teams) as Record<string,unknown>|undefined;const rawCompletions=Array.isArray(row.activity_completions)?row.activity_completions as Array<Record<string,unknown>>:[];const completions=rawCompletions.map(completion=>{const activitiesRelation=completion.activities;const activity=(Array.isArray(activitiesRelation)?activitiesRelation[0]:activitiesRelation) as Record<string,unknown>|undefined;return {id:String(completion.id),title:String(activity?.title??'Activity'),dimension:String(activity?.dimension??'Physical') as Dimension,type:activity?.completion_type==='timed'?'Timed':'Daily check-in',points:Number(completion.points_awarded)};});return {id:String(row.id),name:String(row.display_name),email:String(row.email??''),team:String(teamRecord?.name??'Unassigned'),points:Number(row.points),completions};});setPeople(mapped);setSelectedId(mapped[0]?.id??'');setLoading(false);});},[competitionId]);
  if(loading)return <div className="competition-loading">Loading participants…</div>;
  if(!selected)return <><div className="subpage-heading"><div><h2>Participants & Teams</h2><p>Students will appear here after joining this competition.</p></div></div><div className="library-empty">No participants have joined yet.</div></>;
  return <><div className="subpage-heading"><div><h2>Participants & Teams</h2><p>Select a participant to review their completed activities.</p></div></div><div className="admin-participant-workspace"><section className="participant-directory"><header><strong>Registered students</strong><span>{people.length} participants</span></header>{people.map(person=><div className={selected.id===person.id?'participant-directory-row active':'participant-directory-row'} key={person.id}><button onClick={()=>setSelectedId(person.id)}><span>{person.name.split(' ').map(part=>part[0]).join('')}</span><div><strong>{person.name}</strong><small>{grouped?person.team:'Individual participant'}</small></div><b>{person.points} pts</b></button><button className="participant-delete" aria-label={`Delete ${person.name}`} onClick={()=>deleteParticipant(person)}><Icon name="trash" size={17}/></button></div>)}</section><section className="participant-detail"><header><span>{selected.name.split(' ').map(part=>part[0]).join('')}</span><div><h3>{selected.name}</h3><p>{grouped?selected.team:'Individual competition'} · {selected.points} points</p><small>{selected.email}</small></div></header><div className="participant-activity-summary"><strong>{selected.completions.length}</strong><span>activities completed</span></div><div className="participant-completions">{selected.completions.map(activity=><article key={activity.id}><DimensionIcon dimension={activity.dimension}/><div><h4>{activity.title}</h4><p>{activity.dimension} · {activity.type}</p></div><b>+{activity.points} pts</b><span>Completed</span></article>)}</div></section></div></>;
}

function AssignedActivities({competitionId,refreshKey}:{competitionId:string;refreshKey:number}) {const [items,setItems]=useState<LibraryActivity[]>([]);const [loading,setLoading]=useState(true);useEffect(()=>{getSupabaseBrowserClient()?.from('event_activities').select('activities(id,title,description,dimension,completion_type,duration_minutes,points)').eq('competition_id',competitionId).then(({data})=>{const mapped=(data??[]).flatMap(row=>{const relation=row.activities;const activity=(Array.isArray(relation)?relation[0]:relation) as Record<string,unknown>|null;return activity?[{id:String(activity.id),title:String(activity.title),detail:String(activity.description??''),dimension:String(activity.dimension) as Dimension,type:activity.completion_type==='timed'?'Timed' as const:'Daily check-in' as const,duration:Number(activity.duration_minutes??0),points:Number(activity.points)}]:[];});setItems(mapped);setLoading(false);});},[competitionId,refreshKey]);return <><div className="subpage-heading"><div><h2>Assigned activities</h2><p>{loading?'Loading activities…':`${items.length} ${items.length===1?'activity is':'activities are'} available in this competition.`}</p></div></div><section className="panel no-pad">{loading?<div className="competition-loading">Loading activities…</div>:items.length?<div className="activity-admin-table">{items.map(activity=><article key={activity.id}><DimensionIcon dimension={activity.dimension}/><div><h3>{activity.title}</h3><p>{activity.dimension} · {activity.type}{activity.type==='Timed'?` · ${activity.duration} minutes`:''}</p></div><strong>{activity.points} pts</strong></article>)}</div>:<div className="library-empty">No activities are currently assigned. Use Edit Competition to add activities.</div>}</section></>; }
type LeaderboardRow={id:string;name:string;detail:string;points:number};
function AdminLeaderboard({competitionId,type}:{competitionId:string;type:'Individual'|'Group'}){const [rows,setRows]=useState<LeaderboardRow[]>([]);const [loading,setLoading]=useState(true);useEffect(()=>{const client=getSupabaseBrowserClient();if(!client)return;client.from('participants').select('id,display_name,points,team_memberships(teams(id,name))').eq('competition_id',competitionId).then(({data})=>{if(type==='Individual'){setRows((data??[]).map(person=>({id:person.id,name:person.display_name,detail:'Individual participant',points:person.points})).sort((a,b)=>b.points-a.points));}else{const totals=new Map<string,LeaderboardRow>();for(const person of data??[]){const membership=Array.isArray(person.team_memberships)?person.team_memberships[0]:undefined;const relation=membership?.teams;const team=(Array.isArray(relation)?relation[0]:relation) as {id:string;name:string}|null|undefined;if(!team)continue;const current=totals.get(team.id)??{id:team.id,name:team.name,detail:'0 members',points:0};const members=Number(current.detail.split(' ')[0])+1;totals.set(team.id,{...current,detail:`${members} ${members===1?'member':'members'}`,points:current.points+person.points});}setRows([...totals.values()].sort((a,b)=>b.points-a.points));}setLoading(false);});},[competitionId,type]);return <section className="panel"><PanelHeading title={type==='Group'?'Team leaderboard':'Leaderboard'}/>{loading?<div className="competition-loading">Loading leaderboard…</div>:rows.length?<div className="admin-leaderboard">{rows.map((row,index)=><article key={row.id}><strong>{index+1}</strong><span>{row.name.slice(0,2).toUpperCase()}</span><div><h3>{row.name}</h3><p>{row.detail}</p></div><b>{row.points.toLocaleString()} pts</b></article>)}</div>:<div className="leaderboard-empty"><Icon name="trophy" size={30}/><strong>No leaderboard results yet</strong><span>Rankings will appear after participants join and earn points.</span></div>}</section>;}

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
    if(client&&!activity.id.startsWith('local-')){const {error}=await client.rpc('delete_activity',{activity_id:activity.id});if(error){notify(`Could not delete activity: ${error.message}`);return;}}
    setItems(current=>current.filter(item=>item.id!==activity.id));notify('Activity removed');
  }
  return <><AdminHeading eyebrow="CONTENT" title="Activity library" text="Manage reusable activities across every competition." action="Create activity" onAction={()=>setCreateOpen(true)}/>{loadError&&<div className="library-error">Database unavailable: showing the local prototype library.</div>}<div className="library-layout"><aside className="library-filters"><strong>Dimensions</strong><button className={dimension==='All'?'active':''} onClick={()=>setDimension('All')}>All activities <span>{items.length}</span></button>{(Object.keys(dimensionMeta) as Dimension[]).map(item=><button className={dimension===item?'active':''} key={item} onClick={()=>setDimension(item)}><DimensionIcon dimension={item} size="sm"/>{item}<span>{items.filter(activity=>activity.dimension===item).length}</span></button>)}</aside><section className="panel no-pad"><div className="library-top"><label className="admin-search"><Icon name="search" size={17}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search activities"/></label><button>Timed & check-in</button></div><div className="activity-admin-table">{loading?<div className="library-empty">Loading activities…</div>:shown.length?shown.map(activity=><article key={activity.id}><DimensionIcon dimension={activity.dimension}/><div><h3>{activity.title}</h3><p className="activity-description">{activity.detail||'No description yet.'}</p><p>{activity.dimension} · {activity.type}{activity.type==='Timed'?` · ${activity.duration} minutes`:''}</p></div><strong>{activity.points} pts</strong><div className="activity-row-actions"><button className="activity-edit" aria-label={`Edit ${activity.title}`} onClick={()=>setEditing(activity)}><Icon name="edit" size={18}/></button><button className="activity-delete" aria-label={`Delete ${activity.title}`} onClick={()=>archiveActivity(activity)}><Icon name="trash" size={18}/></button></div></article>):<div className="library-empty">No activities found.</div>}</div></section></div>{createOpen&&<ActivityModal onClose={()=>setCreateOpen(false)} onSave={createActivity}/>} {editing&&<ActivityModal activity={editing} onClose={()=>setEditing(null)} onSave={updateActivity}/>}</>;
}

function ActivityModal({activity,onClose,onSave}:{activity?:LibraryActivity;onClose:()=>void;onSave:(activity:Omit<LibraryActivity,'id'>)=>void}){
  const [title,setTitle]=useState(activity?.title??''); const [detail,setDetail]=useState(activity?.detail??''); const [dimension,setDimension]=useState<Dimension>(activity?.dimension??'Environmental'); const [type,setType]=useState<'Timed'|'Daily check-in'>(activity?.type??'Daily check-in'); const [points,setPoints]=useState(activity?.points??30); const [duration,setDuration]=useState(activity?.duration||10);
  const valid=title.trim().length>=2&&detail.trim().length>=4&&points>0&&(type==='Daily check-in'||duration>0);
  return <div className="modal-backdrop admin-modal-wrap" onMouseDown={onClose}><section className="create-modal activity-create-modal" onMouseDown={event=>event.stopPropagation()}><header><div><span>ACTIVITY LIBRARY</span><h2>{activity?'Edit activity':'Create activity'}</h2><p>{activity?'Clarify what students should do and how it is completed.':'Add a reusable activity to the central library.'}</p></div><button onClick={onClose}><Icon name="close"/></button></header><div className="form-body"><label>Activity title<input value={title} onChange={event=>setTitle(event.target.value)} placeholder="e.g. Take a mindful campus walk"/></label><label>Description<textarea value={detail} onChange={event=>setDetail(event.target.value)} placeholder="Explain clearly what the student should do."/><small>Required. This instruction is shown to students when they open the activity.</small></label><label>Well-being dimension<select value={dimension} onChange={event=>setDimension(event.target.value as Dimension)}>{(Object.keys(dimensionMeta) as Dimension[]).map(item=><option key={item}>{item}</option>)}</select></label><div className="activity-form-row"><label>Completion type<select value={type} onChange={event=>setType(event.target.value as 'Timed'|'Daily check-in')}><option>Daily check-in</option><option>Timed</option></select></label>{type==='Timed'&&<label>Duration (minutes)<input type="number" min="1" value={duration} onChange={event=>setDuration(Number(event.target.value))}/></label>}<label>Points<input type="number" min="1" value={points} onChange={event=>setPoints(Number(event.target.value))}/></label></div></div><footer><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!valid} onClick={()=>onSave({title:title.trim(),detail:detail.trim(),dimension,type,duration:type==='Timed'?duration:0,points})}>{activity?'Save Changes':'Create Activity'}</button></footer></section></div>;
}

/* DESIGN DECISION: A competition is the parent record; participants, teams, memberships, and assigned activities reference its UUID. */
/* TODO(PRODUCTION): Move this multi-table write into a server transaction and persist CSV-imported activities before association. */
type ScheduleValue={date:string;hour:string;minute:string;period:'AM'|'PM'};

function defaultSchedule(dayOffset:number,hour:number):ScheduleValue{
  const date=new Date();
  date.setDate(date.getDate()+dayOffset);
  const localDate=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return {date:localDate,hour:String(hour>12?hour-12:hour||12),minute:'00',period:hour>=12?'PM':'AM'};
}

function scheduleDateTime(value:ScheduleValue){
  const hour12=Number(value.hour);
  const hour24=value.period==='AM'?(hour12===12?0:hour12):(hour12===12?12:hour12+12);
  return `${value.date}T${String(hour24).padStart(2,'0')}:${value.minute}`;
}

function ScheduleField({legend,value,onChange}:{legend:string;value:ScheduleValue;onChange:(value:ScheduleValue)=>void}){
  return <fieldset><legend>{legend}</legend><div><input aria-label={`${legend} date`} type="date" value={value.date} onChange={event=>onChange({...value,date:event.target.value})}/><select aria-label={`${legend} hour`} value={value.hour} onChange={event=>onChange({...value,hour:event.target.value})}>{Array.from({length:12},(_,index)=>String(index+1)).map(hour=><option key={hour}>{hour}</option>)}</select><select aria-label={`${legend} minute`} value={value.minute} onChange={event=>onChange({...value,minute:event.target.value})}>{['00','15','30','45'].map(minute=><option key={minute}>{minute}</option>)}</select><div className="ampm" aria-label={`${legend} AM or PM`}><button type="button" className={value.period==='AM'?'active':''} onClick={()=>onChange({...value,period:'AM'})}>AM</button><button type="button" className={value.period==='PM'?'active':''} onClick={()=>onChange({...value,period:'PM'})}>PM</button></div></div></fieldset>;
}

type EditableActivity={id:string;title:string;dimension:Dimension};
function localDateTimeInput(value:string|undefined){if(!value)return '';const date=new Date(value);const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
function EditCompetition({competition,onClose,onSaved}:{competition:AdminCompetition;onClose:()=>void;onSaved:(competition:AdminCompetition)=>void}){
  const [name,setName]=useState(competition.name);const [description,setDescription]=useState(competition.description??'');const [startAt,setStartAt]=useState(localDateTimeInput(competition.startAt));const [endAt,setEndAt]=useState(localDateTimeInput(competition.endAt));const [library,setLibrary]=useState<EditableActivity[]>([]);const [selectedIds,setSelectedIds]=useState<string[]>([]);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{const client=getSupabaseBrowserClient();if(!client)return;Promise.all([client.from('activities').select('id,title,dimension').eq('is_active',true).order('dimension').order('title'),client.from('event_activities').select('activity_id').eq('competition_id',competition.id)]).then(([activitiesResult,assignedResult])=>{if(activitiesResult.error||assignedResult.error){setError(activitiesResult.error?.message??assignedResult.error?.message??'Could not load activities');setLoading(false);return;}setLibrary((activitiesResult.data??[]) as EditableActivity[]);setSelectedIds((assignedResult.data??[]).map(item=>item.activity_id));setLoading(false);});},[competition.id]);
  const valid=name.trim().length>=3&&description.trim().length>=4&&Boolean(startAt)&&Boolean(endAt)&&new Date(endAt)>new Date(startAt);
  async function save(){const client=getSupabaseBrowserClient();if(!client||!valid)return;setSaving(true);setError('');const startIso=new Date(startAt).toISOString();const endIso=new Date(endAt).toISOString();const status=effectiveCompetitionStatus(startIso,endIso);const {error:updateError}=await client.from('competitions').update({name:name.trim(),description:description.trim(),start_at:startIso,end_at:endIso,status:status.toLowerCase(),updated_at:new Date().toISOString()}).eq('id',competition.id);if(updateError){setError(updateError.message);setSaving(false);return;}const {error:removeError}=await client.from('event_activities').delete().eq('competition_id',competition.id).not('activity_id','in',`(${selectedIds.join(',')||'00000000-0000-0000-0000-000000000000'})`);if(removeError){setError(removeError.message);setSaving(false);return;}if(selectedIds.length){const {error:addError}=await client.from('event_activities').upsert(selectedIds.map(activityId=>({competition_id:competition.id,activity_id:activityId})),{onConflict:'competition_id,activity_id'});if(addError){setError(addError.message);setSaving(false);return;}}onSaved({...competition,name:name.trim(),description:description.trim(),startAt:startIso,endAt:endIso,status,dates:formatCompetitionDates(startIso,endIso),activities:selectedIds.length});}
  const dimensions=[...new Set(library.map(item=>item.dimension))];
  return <div className="modal-backdrop admin-modal-wrap" onMouseDown={onClose}><section className="create-modal edit-competition-modal" onMouseDown={event=>event.stopPropagation()}><header><div><span>EDIT COMPETITION</span><h2>{competition.name}</h2><p>Update details and choose which activities remain available.</p></div><button onClick={onClose}><Icon name="close"/></button></header><div className="form-body"><label>Competition name<input value={name} onChange={event=>setName(event.target.value)}/></label><label>Description<textarea value={description} onChange={event=>setDescription(event.target.value)}/></label><div className="competition-datetime-fields"><label>Start date and time<input type="datetime-local" value={startAt} onChange={event=>setStartAt(event.target.value)}/></label><label>End date and time<input type="datetime-local" value={endAt} onChange={event=>setEndAt(event.target.value)}/></label></div><div className="edit-activity-heading"><div><strong>Assigned activities</strong><span>Removing one stops future access. Existing completions and points are preserved.</span></div><b>{selectedIds.length} selected</b></div>{loading?<div className="competition-loading">Loading activities…</div>:<div className="edit-activity-list">{dimensions.map(dimension=><section key={dimension}><h3>{dimension}</h3>{library.filter(item=>item.dimension===dimension).map(item=><label key={item.id}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={()=>setSelectedIds(current=>current.includes(item.id)?current.filter(id=>id!==item.id):[...current,item.id])}/><span>{item.title}</span></label>)}</section>)}</div>}</div>{error&&<p className="competition-form-error">{error}</p>}<footer><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!valid||loading||saving} onClick={save}>{saving?'Saving…':'Save changes'}</button></footer></section></div>;
}

function CreateCompetition({onClose,onCreated}:{onClose:()=>void;onCreated:(competition:AdminCompetition)=>void}) {
  const [step,setStep]=useState(1); const [type,setType]=useState<'Individual'|'Group'>('Group'); const [name,setName]=useState(''); const [description,setDescription]=useState(''); const [startSchedule,setStartSchedule]=useState<ScheduleValue>(()=>defaultSchedule(0,9)); const [endSchedule,setEndSchedule]=useState<ScheduleValue>(()=>defaultSchedule(0,17)); const [rules,setRules]=useState(defaultRules); const [disclaimer,setDisclaimer]=useState(defaultDisclaimer); const [emailTemplate,setEmailTemplate]=useState(defaultInvitation); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const startAt=scheduleDateTime(startSchedule); const endAt=scheduleDateTime(endSchedule);
  const basicsValid=name.trim().length>=3&&description.trim().length>=4&&new Date(endAt)>new Date(startAt);
  const validationMessage=name.trim().length<3?'Enter a competition name (at least 3 characters).':description.trim().length<4?'Add a short competition description.':new Date(endAt)<=new Date(startAt)?'End date and time must be later than the start.':'';
  async function create(){const client=getSupabaseBrowserClient();if(!client)return;setSaving(true);setError('');const startIso=new Date(startAt).toISOString();const endIso=new Date(endAt).toISOString();const effectiveStatus=effectiveCompetitionStatus(startIso,endIso);const {data,error:competitionError}=await client.from('competitions').insert({name:name.trim(),description:description.trim(),competition_type:type.toLowerCase(),status:effectiveStatus.toLowerCase(),start_at:startIso,end_at:endIso,rules,disclaimer,email_template:emailTemplate,environment:'production'}).select('id,name,competition_code').single();if(competitionError){setError(competitionError.message);setSaving(false);return;}const {data:library}=await client.from('activities').select('id').eq('is_active',true);if(library?.length){const {error:linkError}=await client.from('event_activities').insert(library.map(activity=>({competition_id:data.id,activity_id:activity.id})));if(linkError){setError(linkError.message);setSaving(false);return;}}onCreated({id:data.id,name:data.name,type,status:effectiveStatus,participants:0,activities:library?.length??0,dates:formatCompetitionDates(startIso,endIso),description:description.trim(),code:data.competition_code,startAt:startIso,endAt:endIso});}
  return <div className="modal-backdrop admin-modal-wrap" onMouseDown={onClose}><section className="create-modal" onMouseDown={event=>event.stopPropagation()}><header><div><span>NEW COMPETITION</span><h2>Create competition</h2><p>Set the basics, schedule, participant guidance, and activities.</p></div><button onClick={onClose}><Icon name="close"/></button></header><div className="stepper two-step"><span className="active">1 <small>Basics</small></span><i/><span className={step>=2?'active':''}>2 <small>Activities</small></span></div>{step===1&&<div className="form-body"><label>Competition name<input value={name} onChange={event=>setName(event.target.value)} placeholder="e.g. Spring Well-Being Challenge"/></label><label>Description<textarea value={description} onChange={event=>setDescription(event.target.value)} placeholder="What should students know about this competition?"/></label><div><span className="field-label">Competition type</span><div className="type-options"><button className={type==='Individual'?'active':''} onClick={()=>setType('Individual')}><Icon name="user"/><strong>Individual</strong><small>Students participate independently; no teams are created.</small></button><button className={type==='Group'?'active':''} onClick={()=>setType('Group')}><Icon name="users"/><strong>Group</strong><small>Create and invite teams from the management page.</small></button></div></div><div className="schedule-fields"><ScheduleField legend="Start date and time (Boston time)" value={startSchedule} onChange={setStartSchedule}/><ScheduleField legend="End date and time (Boston time)" value={endSchedule} onChange={setEndSchedule}/></div><label>Participant rules<textarea className="long-field" value={rules} onChange={event=>setRules(event.target.value)}/></label><label>Participant disclaimer<textarea className="long-field" value={disclaimer} onChange={event=>setDisclaimer(event.target.value)}/></label><label>Invitation message<textarea className="long-field" value={emailTemplate} onChange={event=>setEmailTemplate(event.target.value)}/></label></div>}{step===2&&<ActivitySelectionStep/>}{error&&<p className="competition-form-error">{error}</p>}<footer>{step===1&&validationMessage&&<span className="competition-validation-note">{validationMessage}</span>}<button className="secondary-button" onClick={()=>step===1?onClose():setStep(1)}>{step===1?'Cancel':'Back'}</button><button className="primary-button" disabled={saving||(step===1&&!basicsValid)} onClick={()=>step===2?create():setStep(2)}>{saving?'Creating…':step===2?'Create Competition':'Continue'} <Icon name="arrow" size={17}/></button></footer></section></div>;
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
