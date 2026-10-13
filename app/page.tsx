'use client';

import Image from 'next/image';
import { useState } from 'react';
import { activities, competitions, dimensionMeta, studentLeaderboard, teamLeaderboard, type Competition, type Dimension } from './prototype-data';
import { DimensionIcon, Icon, Logo } from './ui';

type StudentTab = 'Home' | 'My Challenges' | 'Ranking' | 'Profile';

export default function StudentPlatform() {
  const [tab, setTab] = useState<StudentTab>('Home');
  const [joined, setJoined] = useState(['fall', 'eng']);
  const [completed, setCompleted] = useState([3, 11, 13]);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<(typeof activities)[number] | null>(null);
  const joinCompetition = (id: string) => setJoined((current) => current.includes(id) ? current : [...current, id]);
  const finishActivity = (id: number) => setCompleted((current) => current.includes(id) ? current : [...current, id]);

  return <main className="student-app">
    <header className="student-header"><Logo/><div className="student-header-actions"><a href="/admin" className="admin-link">Admin preview</a><button className="avatar-button">DZ</button></div></header>
    <div className="student-layout">
      <nav className="student-nav" aria-label="Student navigation">{([['Home','home'],['My Challenges','target'],['Ranking','trophy'],['Profile','user']] as const).map(([label, icon]) => <button key={label} className={tab === label ? 'active' : ''} onClick={() => { setTab(label); setSelectedCompetition(null); }}><Icon name={icon}/><span>{label}</span></button>)}</nav>
      <section className="student-content">{selectedCompetition ? <CompetitionDetail competition={selectedCompetition} joined={joined.includes(selectedCompetition.id)} onJoin={() => joinCompetition(selectedCompetition.id)} onBack={() => setSelectedCompetition(null)} onActivity={setSelectedActivity} completed={completed}/> : <>
        {tab === 'Home' && <StudentHome completed={completed.length} onNavigate={setTab} onCompetition={setSelectedCompetition} onActivity={setSelectedActivity}/>}
        {tab === 'My Challenges' && <MyChallenges joined={joined} onCompetition={setSelectedCompetition}/>}
        {tab === 'Ranking' && <Leaderboards/>}{tab === 'Profile' && <StudentProfile completed={completed.length}/>}
      </>}</section>
    </div>
    <nav className="mobile-nav" aria-label="Student navigation">{([['Home','home'],['My Challenges','target'],['Ranking','trophy'],['Profile','user']] as const).map(([label, icon]) => <button key={label} className={tab === label ? 'active' : ''} onClick={() => { setTab(label); setSelectedCompetition(null); }}><Icon name={icon}/><small>{label === 'My Challenges' ? 'Challenges' : label}</small></button>)}</nav>
    {selectedActivity && <ActivityModal activity={selectedActivity} done={completed.includes(selectedActivity.id)} onClose={() => setSelectedActivity(null)} onComplete={() => finishActivity(selectedActivity.id)}/>}
  </main>;
}

function StudentHome({ completed, onNavigate, onCompetition, onActivity }: { completed: number; onNavigate: (tab: StudentTab) => void; onCompetition: (competition: Competition) => void; onActivity: (activity: typeof activities[number]) => void }) {
  return <div className="student-page"><div className="welcome-row simple"><h1>Welcome, Dannar</h1><Image src="/terrier-mascot-v2.png" alt="Friendly Boston Terrier mascot" width={1213} height={1296} priority/></div>
    <SectionHeading eyebrow="ACTIVE NOW" title="Your competitions" action="View all" onAction={() => onNavigate('My Challenges')}/><div className="competition-grid">{competitions.filter((c) => c.joined).map((competition) => <CompetitionCard key={competition.id} competition={competition} onClick={() => onCompetition(competition)}/>)}</div>
    <SectionHeading eyebrow="TODAY’S PICKS" title="Small actions, real impact"/><div className="quick-actions">{activities.slice(0,4).map((activity) => <article key={activity.id}><DimensionIcon dimension={activity.dimension}/><div><span>{activity.dimension}</span><h3>{activity.title}</h3><small><Icon name="clock" size={13}/> {activity.type === 'Timed' ? `${activity.duration} min` : 'Daily check-in'} · +{activity.points} pts</small></div><button aria-label={`Open ${activity.title}`} onClick={() => onActivity(activity)}><Icon name="chevron" size={18}/></button></article>)}</div>
    <div className="home-stats"><article><strong>{completed}</strong><span>Activities completed</span></article><article><strong>3</strong><span>Badges earned</span></article><article><strong>#12</strong><span>Campus rank</span></article></div>
  </div>;
}

function CompetitionCard({ competition, onClick }: { competition: Competition; onClick: () => void }) {
  return <button className="competition-card" onClick={onClick} style={{ '--accent': competition.accent } as React.CSSProperties}><div className="competition-card-top"><span className="type-pill"><Icon name={competition.type === 'Group' ? 'users' : 'user'} size={14}/> {competition.type}</span><Icon name="chevron"/></div><h3>{competition.name}</h3>{competition.type === 'Group' && <p className="team-name">Team · {competition.teams?.[0]}</p>}<div className="competition-meta"><span>{competition.date}</span><span>{competition.progress}% complete</span></div><div className="progress-line"><i style={{width:`${competition.progress}%`}}/></div></button>;
}

function MyChallenges({ joined, onCompetition }: { joined: string[]; onCompetition: (competition: Competition) => void }) {
  const current = competitions.filter((competition) => joined.includes(competition.id));
  return <div className="student-page"><PageIntro eyebrow="" title="My challenges" text=""/><SectionHeading title="In progress"/><div className="competition-list">{current.map((competition) => <CompetitionCard key={competition.id} competition={competition} onClick={() => onCompetition(competition)}/>)}</div></div>;
}

function CompetitionDetail({ competition, joined, onJoin, onBack, onActivity, completed }: { competition: Competition; joined: boolean; onJoin: () => void; onBack: () => void; onActivity: (activity: typeof activities[number]) => void; completed: number[] }) {
  const teamMembers=[{name:'Dannar Zharkyn',points:420},{name:'Maya Rodriguez',points:380},{name:'Jordan Lee',points:315},{name:'Alex Turner',points:270}];
  return <div className="student-page competition-detail"><button className="back-link" onClick={onBack}>← Back</button><section className="competition-detail-hero" style={{'--accent':competition.accent} as React.CSSProperties}><span className="type-pill">{competition.type} competition</span><h1>{competition.name}</h1><p>{competition.description}</p><div><span>{competition.date}</span>{competition.type === 'Group' && <span>Team · {competition.teams?.[0]}</span>}</div>{!joined && <button onClick={onJoin}>Join competition</button>}</section><div className="detail-stat-row"><article><span>Progress</span><strong>{joined?`${competition.progress}%`:'—'}</strong></article><article><span>Your rank</span><strong>{joined?'#3':'—'}</strong></article><article><span>Completed</span><strong>{joined?`${completed.length}/14`:'—'}</strong></article></div><SectionHeading title="Activities" subtitle="Complete these to earn competition points"/><div className="quick-actions">{activities.slice(0,6).map((activity) => <article key={activity.id}><DimensionIcon dimension={activity.dimension}/><div><span>{activity.dimension}</span><h3>{activity.title}</h3><small>{completed.includes(activity.id)?'Completed':`${activity.type === 'Timed' ? `${activity.duration} min` : 'Daily check-in'} · +${activity.points} pts`}</small></div><button onClick={() => onActivity(activity)}>{completed.includes(activity.id)?<Icon name="check"/>:<Icon name="chevron"/>}</button></article>)}</div>{competition.type==='Group'&&<><SectionHeading title="My team" subtitle={`${competition.teams?.[0]} · ${teamMembers.length} members`}/><section className="student-team"><header><div><Icon name="users"/><span><strong>{competition.teams?.[0]}</strong><small>{teamMembers.length} team members</small></span></div><b>{teamMembers.reduce((sum,member)=>sum+member.points,0).toLocaleString()} pts</b></header>{teamMembers.map(member=><article key={member.name} className={member.name.startsWith('Dannar')?'you':''}><span>{member.name.split(' ').map(part=>part[0]).join('')}</span><strong>{member.name}{member.name.startsWith('Dannar')&&<small>You</small>}</strong><b>{member.points} pts</b></article>)}<footer>Only contribution points are visible to teammates. Individual activity details remain private.</footer></section></>}</div>;
}

function Leaderboards() {
  const [board, setBoard] = useState<'Team'|'Individual'>('Team'); const [competition,setCompetition]=useState<'Engineering Floor Cup'|'Fall Well-Being Challenge'>('Engineering Floor Cup'); const rows = board === 'Team' ? teamLeaderboard : studentLeaderboard;
  return <div className="student-page"><PageIntro eyebrow="" title="Ranking" text=""/><div className="ranking-picker"><span>Competition</span>{(['Engineering Floor Cup','Fall Well-Being Challenge'] as const).map(item=><button className={competition===item?'active':''} key={item} onClick={()=>setCompetition(item)}><Icon name={item.startsWith('Engineering')?'users':'user'} size={17}/><strong>{item}</strong><Icon name="check" size={16}/></button>)}</div><div className="segmented"><button className={board==='Team'?'active':''} onClick={() => setBoard('Team')}>Teams</button><button className={board==='Individual'?'active':''} onClick={() => setBoard('Individual')}>Individuals</button></div><section className="leader-podium"><div><span>2</span><div className="podium-avatar">{rows[1].name.slice(0,2)}</div><strong>{rows[1].name}</strong><small>{rows[1].points.toLocaleString()} pts</small></div><div className="first"><span>1</span><div className="podium-avatar">{rows[0].name.slice(0,2)}</div><strong>{rows[0].name}</strong><small>{rows[0].points.toLocaleString()} pts</small></div><div><span>3</span><div className="podium-avatar">{rows[2].name.slice(0,2)}</div><strong>{rows[2].name}</strong><small>{rows[2].points.toLocaleString()} pts</small></div></section><div className="leader-table">{rows.map((row,index) => <article key={row.name} className={row.name.includes('Dannar')||row.name==='Kilachand 4'?'you':''}><strong>{index+1}</strong><span className="row-avatar">{row.name.slice(0,2)}</span><div><h3>{row.name}</h3><p>{row.detail}</p></div><b>{row.points.toLocaleString()}</b></article>)}</div></div>;
}

function StudentProfile({ completed }: { completed: number }) {
  const scores=[70,55,80,30,45,60,75];
  return <div className="student-page"><PageIntro eyebrow="YOUR PROFILE" title="Progress & achievements" text="Celebrate the habits you are building across every dimension."/><section className="profile-summary"><div className="profile-avatar">DZ</div><div><h2>Dannar Zharkyn</h2><p>College of Engineering · Class of 2027</p></div><button>Edit profile</button></section><div className="profile-stats"><article><Icon name="spark"/><strong>420</strong><span>Total points</span></article><article><Icon name="check"/><strong>{completed}</strong><span>Completed</span></article><article><Icon name="target"/><strong>3</strong><span>Badges</span></article></div><SectionHeading title="Your seven dimensions" subtitle="A balanced view of your recent activity"/><div className="dimension-progress">{(Object.keys(dimensionMeta) as Dimension[]).map((dimension,index) => <article key={dimension}><DimensionIcon dimension={dimension}/><div><span>{dimension}</span><div><i style={{width:`${scores[index]}%`,background:dimensionMeta[dimension].color}}/></div></div><strong>{scores[index]}%</strong></article>)}</div><SectionHeading title="Recent badges" action="See all"/><div className="badge-row">{['First Step','Good Neighbor','Mindful Moment'].map((badge,index) => <article key={badge}><span><Icon name={['move','people','heart'][index]} size={28}/></span><strong>{badge}</strong><small>Earned this month</small></article>)}</div></div>;
}

function ActivityModal({ activity, done, onClose, onComplete }: { activity: typeof activities[number]; done: boolean; onClose: () => void; onComplete: () => void }) {
  const [started,setStarted]=useState(false);
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="activity-modal" onMouseDown={(event)=>event.stopPropagation()}><button className="modal-close" onClick={onClose}><Icon name="close"/></button><DimensionIcon dimension={activity.dimension} size="lg"/><span className="modal-dimension" style={{color:dimensionMeta[activity.dimension].color}}>{activity.dimension}</span><h2>{activity.title}</h2><p>{activity.detail} Take this moment at your own pace—there is no need to be perfect.</p><div className="modal-meta"><span><Icon name="clock"/> {activity.type === 'Timed' ? `${activity.duration} minutes` : 'Daily check-in'}</span><span><Icon name="spark"/> {activity.points} points</span></div>{started&&activity.type==='Timed'?<div className="timer-demo"><span>Time remaining</span><strong>{String(activity.duration).padStart(2,'0')}:00</strong><div><i/></div><button onClick={()=>setStarted(false)}>Quit activity</button></div>:<button className="primary-button" disabled={done} onClick={()=>{onComplete();if(activity.type==='Timed')setStarted(true);}}>{done?'Completed':activity.type==='Timed'?'Start activity':'Complete check-in'}</button>}</section></div>;
}

function PageIntro({eyebrow,title,text}:{eyebrow:string;title:string;text:string}) { return <header className="page-intro">{eyebrow&&<span className="kicker">{eyebrow}</span>}<h1>{title}</h1>{text&&<p>{text}</p>}</header>; }
function SectionHeading({eyebrow,title,subtitle,action,onAction}:{eyebrow?:string;title:string;subtitle?:string;action?:string;onAction?:()=>void}) { return <div className="section-heading"><div>{eyebrow&&<span className="kicker">{eyebrow}</span>}<h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action&&<button onClick={onAction}>{action}</button>}</div>; }
