'use client';

import { useState } from 'react';
import Link from 'next/link';
import { activities, adminCompetitions, dimensionMeta, teamLeaderboard, type Dimension } from '../prototype-data';
import { DimensionIcon, Icon, Logo } from '../ui';

type AdminView = 'Overview' | 'Competitions' | 'Activity Library';
type AdminCompetition = typeof adminCompetitions[number];

export default function AdminDashboard() {
  const [view, setView] = useState<AdminView>('Overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<AdminCompetition | null>(null);
  const [toast, setToast] = useState('');
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400); };
  return <main className="admin-app">
    <aside className="admin-sidebar"><Logo/><div className="admin-org"><span>SW</span><div><strong>Student Wellbeing</strong><small>Boston University</small></div></div><nav>{([['Overview','grid'],['Competitions','trophy'],['Activity Library','target']] as const).map(([label,icon]) => <button key={label} className={view===label?'active':''} onClick={() => {setView(label);setSelected(null);}}><Icon name={icon}/>{label}</button>)}</nav><div className="admin-sidebar-footer"><Link href="/">← Student experience</Link><div><span>PF</span><p><strong>Pedro Falci</strong><small>Administrator</small></p></div></div></aside>
    <section className="admin-main"><header className="admin-topbar"><div><span>Student Wellbeing workspace</span><strong>{selected?.name ?? view}</strong></div><div><button className="icon-button"><Icon name="search"/></button><button className="avatar-button">PF</button></div></header>
      <div className="admin-content">{selected ? <AdminCompetitionDetail competition={selected} onBack={() => setSelected(null)} notify={notify}/> : <>
        {view==='Overview'&&<Overview onCreate={()=>setCreateOpen(true)} onOpen={setSelected}/>} 
        {view==='Competitions'&&<Competitions onCreate={()=>setCreateOpen(true)} onOpen={setSelected}/>} 
        {view==='Activity Library'&&<ActivityLibrary notify={notify}/>} 
      </>}</div>
    </section>
    {createOpen&&<CreateCompetition onClose={()=>setCreateOpen(false)} onCreated={()=>{setCreateOpen(false);notify('Competition draft created');}}/>}
    {toast&&<div className="toast"><Icon name="check"/>{toast}</div>}
  </main>;
}

function Overview({onCreate,onOpen}:{onCreate:()=>void;onOpen:(item:AdminCompetition)=>void}) {
  return <><AdminHeading eyebrow="OVERVIEW" title="Good morning, Pedro" text="Manage current and upcoming well-being competitions." action="Create competition" onAction={onCreate}/><div className="admin-competition-cards">{adminCompetitions.map(item=><button key={item.name} onClick={()=>onOpen(item)}><div><span className={`large-status ${item.status.toLowerCase()}`}>{item.status}</span><Icon name="chevron"/></div><h2>{item.name}</h2><p>{item.type} competition</p><footer>{item.dates}</footer></button>)}</div></>;
}

function Competitions({onCreate,onOpen}:{onCreate:()=>void;onOpen:(item:AdminCompetition)=>void}) {
  const [filter,setFilter]=useState('All');
  const items=filter==='All'?adminCompetitions:adminCompetitions.filter((item)=>item.status===filter);
  return <><AdminHeading eyebrow="MANAGE" title="Competitions" text="Create, organize, and monitor every well-being competition." action="Create competition" onAction={onCreate}/><div className="admin-toolbar"><div className="tabs">{['All','Active','Scheduled','Draft'].map(item=><button className={filter===item?'active':''} key={item} onClick={()=>setFilter(item)}>{item}<span>{item==='All'?4:adminCompetitions.filter(c=>c.status===item).length}</span></button>)}</div><label className="admin-search"><Icon name="search" size={17}/><input placeholder="Search competitions"/></label></div><section className="panel no-pad"><AdminCompetitionTable items={items} onOpen={onOpen}/></section></>;
}

function AdminCompetitionTable({items,onOpen}:{items:AdminCompetition[];onOpen:(item:AdminCompetition)=>void}) {
  return <div className="admin-table"><div className="admin-table-head"><span>Competition</span><span>Type</span><span>Status</span><span>Participants</span><span>Dates</span><span/></div>{items.map(item=><button className="admin-table-row" key={item.name} onClick={()=>onOpen(item)}><div><span className="table-mark"><Icon name={item.type==='Group'?'users':'user'} size={18}/></span><p><strong>{item.name}</strong><small>{item.activities} activities</small></p></div><span>{item.type}</span><span><i className={`status ${item.status.toLowerCase()}`}/>{item.status}</span><strong>{item.participants.toLocaleString()}</strong><span>{item.dates}</span><Icon name="chevron" size={18}/></button>)}</div>;
}

function AdminCompetitionDetail({competition,onBack,notify}:{competition:AdminCompetition;onBack:()=>void;notify:(m:string)=>void}) {
  const [tab,setTab]=useState<'Overview'|'Participants'|'Teams'|'Activities'|'Leaderboard'>('Overview');
  return <><button className="admin-back" onClick={onBack}>← Competitions</button><div className="admin-detail-heading"><div><span className={`large-status ${competition.status.toLowerCase()}`}>{competition.status}</span><h1>{competition.name}</h1><p>{competition.type} competition · {competition.dates}</p></div><button className="secondary-button">Edit details</button></div><div className="detail-tabs">{(['Overview','Participants','Teams','Activities','Leaderboard'] as const).map(item=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{item}</button>)}</div>{tab==='Overview'&&<div className="metric-grid three"><Metric label="Participants" value={competition.participants.toString()} change="Registered students" icon="users"/><Metric label="Activities completed" value="104" change="Across this competition" icon="check"/><Metric label="Total points" value="4,280" change="Earned by participants" icon="spark"/></div>}{tab==='Participants'&&<CompetitionParticipants grouped={competition.type==='Group'}/>} {tab==='Teams'&&<TeamManager notify={notify}/>} {tab==='Activities'&&<AssignedActivities notify={notify}/>} {tab==='Leaderboard'&&<AdminLeaderboard/>}</>;
}

function TeamManager({notify}:{notify:(m:string)=>void}) {
  const teams=['Kilachand 4','Myles 3','Warren A8','Danielsen 2'];
  return <><div className="subpage-heading"><div><h2>Teams & invitation links</h2><p>Students who use a team link are assigned automatically.</p></div><button className="primary-button"><Icon name="plus"/> Add team</button></div><div className="team-grid">{teams.map((team,index)=><article key={team}><header><span>{team.split(' ').map(x=>x[0]).join('')}</span><div><h3>{team}</h3><p>{[14,12,15,11][index]} members</p></div><button>•••</button></header><div className="team-members"><span>{['Maya R.','Jordan L.','Alex T.'][index%3]}</span><span>{['Sam K.','Dannar Z.','Taylor M.'][index%3]}</span><span>+{[12,10,13,9][index]} more</span></div><div className="fake-qr"><Icon name="qr" size={76}/></div><label>Invitation link<div><input readOnly value={`wellbeing.bu.edu/join/${team.toLowerCase().replaceAll(' ','-')}`}/><button onClick={()=>notify('Invitation link copied')}><Icon name="link" size={17}/></button></div></label><footer><button onClick={()=>notify(`${team} QR code ready to download`)}><Icon name="qr" size={16}/> Download QR</button><span>{[1240,1160,980,840][index].toLocaleString()} pts</span></footer></article>)}</div></>;
}

function CompetitionParticipants({grouped}:{grouped:boolean}) { const teams=grouped?['Kilachand 4','Myles 3','Warren A8']:['Individual participants']; const people=[['Maya Rodriguez','Jordan Lee','Alex Turner'],['Dannar Zharkyn','Sam Kim','Taylor Moore'],['Jamie Chen','Morgan Reed','Casey Hall']]; return <><div className="subpage-heading"><div><h2>Registered students</h2><p>{grouped?'Participants are grouped by their assigned team.':'Students participating independently.'}</p></div></div><div className="participant-groups">{teams.map((team,index)=><section className="panel" key={team}><PanelHeading title={team}/>{people[index].map((name,personIndex)=><article key={name}><span>{name.split(' ').map(part=>part[0]).join('')}</span><div><strong>{name}</strong><small>{[5,4,3][personIndex]} activities completed</small></div><b>{[420,360,280][personIndex]} pts</b></article>)}</section>)}</div></>; }

function AssignedActivities({notify}:{notify:(m:string)=>void}) { return <><div className="subpage-heading"><div><h2>Assigned activities</h2><p>12 activities are available in this competition.</p></div><button className="primary-button" onClick={()=>notify('Activity picker opened')}><Icon name="plus"/> Assign activities</button></div><section className="panel no-pad"><div className="activity-admin-table">{activities.slice(0,8).map(activity=><article key={activity.id}><DimensionIcon dimension={activity.dimension}/><div><h3>{activity.title}</h3><p>{activity.dimension} · {activity.type}{activity.type==='Timed'?` · ${activity.duration} minutes`:''}</p></div><strong>{activity.points} pts</strong><button>•••</button></article>)}</div></section></>; }
function AdminLeaderboard(){return <section className="panel"><PanelHeading title="Live team leaderboard" action="Export"/><div className="admin-leaderboard">{teamLeaderboard.map((team,index)=><article key={team.name}><strong>{index+1}</strong><span>{team.name.slice(0,2)}</span><div><h3>{team.name}</h3><p>{team.detail}</p></div><b>{team.points.toLocaleString()} pts</b></article>)}</div></section>;}

function ActivityLibrary({notify}:{notify:(m:string)=>void}) {
  const [dimension,setDimension]=useState<Dimension|'All'>('All'); const shown=dimension==='All'?activities:activities.filter(a=>a.dimension===dimension);
  return <><AdminHeading eyebrow="CONTENT" title="Activity library" text="Manage reusable activities across every competition." action="Create activity" onAction={()=>notify('New activity form opened')}/><div className="library-layout"><aside className="library-filters"><strong>Dimensions</strong><button className={dimension==='All'?'active':''} onClick={()=>setDimension('All')}>All activities <span>{activities.length}</span></button>{(Object.keys(dimensionMeta) as Dimension[]).map(item=><button className={dimension===item?'active':''} key={item} onClick={()=>setDimension(item)}><DimensionIcon dimension={item} size="sm"/>{item}<span>{activities.filter(a=>a.dimension===item).length}</span></button>)}</aside><section className="panel no-pad"><div className="library-top"><label className="admin-search"><Icon name="search" size={17}/><input placeholder="Search activities"/></label><button>Timed & check-in</button></div><div className="activity-admin-table">{shown.map(activity=><article key={activity.id}><DimensionIcon dimension={activity.dimension}/><div><h3>{activity.title}</h3><p>{activity.dimension} · {activity.type}{activity.type==='Timed'?` · ${activity.duration} minutes`:''}</p></div><strong>{activity.points} pts</strong><button>•••</button></article>)}</div></section></div></>;
}

function CreateCompetition({onClose,onCreated}:{onClose:()=>void;onCreated:()=>void}){const [step,setStep]=useState(1);const [type,setType]=useState<'Individual'|'Group'>('Group');return <div className="modal-backdrop admin-modal-wrap" onMouseDown={onClose}><section className="create-modal" onMouseDown={e=>e.stopPropagation()}><header><div><span>NEW COMPETITION</span><h2>Create competition</h2></div><button onClick={onClose}><Icon name="close"/></button></header><div className="stepper"><span className="active">1 <small>Basics</small></span><i/><span className={step>=2?'active':''}>2 <small>Activities</small></span><i/><span className={step>=3?'active':''}>3 <small>Teams</small></span></div>{step===1&&<div className="form-body"><label>Competition name<input placeholder="e.g. Spring Well-Being Challenge"/></label><label>Description<textarea placeholder="What should students know about this competition?"/></label><div><span className="field-label">Competition type</span><div className="type-options"><button className={type==='Individual'?'active':''} onClick={()=>setType('Individual')}><Icon name="user"/><strong>Individual</strong><small>Students compete independently</small></button><button className={type==='Group'?'active':''} onClick={()=>setType('Group')}><Icon name="users"/><strong>Group</strong><small>Teams compete together</small></button></div></div><div className="date-fields"><label>Start date<input type="date"/></label><label>End date<input type="date"/></label></div></div>}{step===2&&<ActivitySelectionStep/>}{step===3&&<div className="form-body"><h3>{type==='Group'?'Create teams':'Ready to publish'}</h3><p>{type==='Group'?'Add team names now. Unique links and QR codes will be generated automatically.':'Review the competition and save it as a draft.'}</p>{type==='Group'&&<div className="team-inputs"><input defaultValue="Team A"/><input defaultValue="Team B"/><button><Icon name="plus"/> Add another team</button></div>}<div className="review-box"><Icon name="check"/><div><strong>Everything can be edited later</strong><span>This prototype saves a visual draft only.</span></div></div></div>}<footer><button className="secondary-button" onClick={()=>step===1?onClose():setStep(step-1)}>{step===1?'Cancel':'Back'}</button><button className="primary-button" onClick={()=>step===3?onCreated():setStep(step+1)}>{step===3?'Create draft':'Continue'} <Icon name="arrow" size={17}/></button></footer></section></div>}

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

function AdminHeading({eyebrow,title,text,action,onAction}:{eyebrow:string;title:string;text:string;action?:string;onAction?:()=>void}){return <header className="admin-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action&&<button className="primary-button" onClick={onAction}><Icon name="plus"/>{action}</button>}</header>}
function Metric({label,value,change,icon}:{label:string;value:string;change:string;icon:string}){return <article className="metric-card"><div><span>{label}</span><strong>{value}</strong><small>{change}</small></div><i><Icon name={icon}/></i></article>}
function PanelHeading({title,action}:{title:string;action?:string}){return <header className="panel-heading"><h2>{title}</h2>{action&&<button>{action}</button>}</header>}
