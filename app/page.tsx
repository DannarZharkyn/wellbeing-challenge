'use client';

import { useState } from 'react';
import Image from 'next/image';

type Tab = 'home' | 'challenges' | 'ranking' | 'profile';

const challenges = [
  { id: 1, icon: '☀', title: 'Walk outside for 10 minutes', detail: 'Fresh air, fresh perspective', points: 50, color: 'mint' },
  { id: 2, icon: '♧', title: 'Invite a friend for a run', detail: 'Wellbeing is better together', points: 100, color: 'blue' },
  { id: 3, icon: '◌', title: 'Take a 5-minute breathing break', detail: 'Reset and refocus your mind', points: 40, color: 'lavender' },
  { id: 4, icon: '✦', title: 'Share one thing you are grateful for', detail: 'A small moment of positivity', points: 30, color: 'peach' },
  { id: 5, icon: '⌁', title: 'Choose water with your lunch', detail: 'A simple healthy switch', points: 25, color: 'aqua' },
];

const faculties = [
  { rank: 1, name: 'College of Engineering', points: 12840, badge: 'ENG', color: '#7b68a8' },
  { rank: 2, name: 'College of Arts & Sciences', points: 11620, badge: 'CAS', color: '#2f7e74' },
  { rank: 3, name: 'Questrom School of Business', points: 10450, badge: 'QST', color: '#bd7358' },
  { rank: 4, name: 'College of Communication', points: 9210, badge: 'COM', color: '#5878a9' },
  { rank: 5, name: 'Sargent College', points: 8760, badge: 'SAR', color: '#9a7d44' },
];

export default function WellbeingApp() {
  const [tab, setTab] = useState<Tab>('home');
  const [completed, setCompleted] = useState<number[]>([3, 5]);
  const totalPoints = 340 + completed.reduce((sum, id) => sum + (challenges.find((c) => c.id === id)?.points ?? 0), 0);

  function toggleChallenge(id: number) {
    setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <main className="app-shell">
      <div className="phone-frame">
        <section className="screen" aria-live="polite">
          {tab === 'home' && <Home totalPoints={totalPoints} completed={completed.length} onExplore={() => setTab('challenges')} />}
          {tab === 'challenges' && <Challenges completed={completed} onToggle={toggleChallenge} />}
          {tab === 'ranking' && <Ranking />}
          {tab === 'profile' && <Profile totalPoints={totalPoints} completed={completed.length} />}
        </section>
        <nav className="bottom-nav" aria-label="Main navigation">
          <NavButton label="Home" icon="⌂" active={tab === 'home'} onClick={() => setTab('home')} />
          <NavButton label="Challenges" icon="✓" active={tab === 'challenges'} onClick={() => setTab('challenges')} />
          <NavButton label="Ranking" icon="▥" active={tab === 'ranking'} onClick={() => setTab('ranking')} />
          <NavButton label="Profile" icon="○" active={tab === 'profile'} onClick={() => setTab('profile')} />
        </nav>
      </div>
    </main>
  );
}

function Header({ title }: { title: string }) {
  return <header className="page-header"><h1>{title}</h1></header>;
}

function Home({ totalPoints, completed, onExplore }: { totalPoints: number; completed: number; onExplore: () => void }) {
  return <div className="page home-page">
    <div className="home-top"><div><h1>Hi, Dannar <span>👋</span></h1></div><button className="avatar mini" aria-label="Profile">DZ</button></div>
    <div className="hero-card"><div className="hero-copy"><h2>Small steps.<br/>Stronger together.</h2><button onClick={onExplore}>Explore challenges <span>→</span></button></div><div className="hero-art" aria-hidden="true"><span className="sun"/><span className="hill hill-one"/><span className="hill hill-two"/><Image className="terrier-mascot" src="/terrier-mascot-v2.png" alt="" width={1213} height={1296} priority /></div></div>
    <div className="section-title"><div><p className="eyebrow">YOUR PROGRESS</p><h2>Keep it going</h2></div><span className="week-label">Week 2 of 3</span></div>
    <div className="progress-card"><div className="ring" style={{'--progress': `${Math.min(88, 32 + completed * 9)}%`} as React.CSSProperties}><div><strong>{completed}</strong><span>done</span></div></div><div className="progress-info"><strong>{totalPoints.toLocaleString()}</strong><span>points earned</span><div className="bar"><i style={{width: `${Math.min(100, totalPoints / 8)}%`}}/></div><small>{Math.max(0, 800-totalPoints)} points to your next badge</small></div></div>
    <div className="section-title compact"><div><p className="eyebrow">COMING UP</p><h2>Wellbeing events</h2></div><button className="text-button">See all</button></div>
    <article className="event-card"><div className="event-date"><strong>28</strong><span>SEP</span></div><div><span className="pill">IN PERSON</span><h3>Campus wellbeing walk</h3><p>12:30 PM · Main Library steps</p></div><button className="round-button" aria-label="View event">→</button></article>
  </div>;
}

function Challenges({ completed, onToggle }: { completed: number[]; onToggle: (id: number) => void }) {
  return <div className="page"><Header title="Challenges" />
    <div className="filter-row"><button className="filter active">All</button><button className="filter">Movement</button><button className="filter">Mind</button><button className="filter">Social</button></div>
    <div className="challenge-summary"><div><strong>{completed.length}/{challenges.length}</strong><span>completed this week</span></div><div className="tiny-bar"><i style={{width: `${completed.length/challenges.length*100}%`}}/></div></div>
    <div className="challenge-list">{challenges.map((challenge) => { const done = completed.includes(challenge.id); return <article className={`challenge-card ${done ? 'done' : ''}`} key={challenge.id}><div className={`challenge-icon ${challenge.color}`}>{challenge.icon}</div><div className="challenge-copy"><h3>{challenge.title}</h3><p>{challenge.detail}</p><span>+{challenge.points} pts</span></div><button className="check-button" aria-label={`${done ? 'Undo' : 'Complete'} ${challenge.title}`} aria-pressed={done} onClick={() => onToggle(challenge.id)}>{done ? '✓' : ''}</button></article>; })}</div>
  </div>;
}

function Ranking() {
  return <div className="page ranking-page"><Header title="College ranking" /><div className="ranking-hero"><span>WEEK 2</span><strong>52,880</strong><p>community points earned</p><div className="sparkles">✦　·　✦</div></div><div className="ranking-label"><span>RANK</span><span>COLLEGE</span><span>POINTS</span></div><div className="ranking-list">{faculties.map((faculty) => <article key={faculty.rank} className={faculty.rank === 1 ? 'your-faculty' : ''}><strong className="rank-number">{faculty.rank}</strong><span className="faculty-badge" style={{background: faculty.color}}>{faculty.badge}</span><div><h3>{faculty.name}</h3>{faculty.rank === 1 && <p>Your college</p>}</div><strong className="faculty-points">{faculty.points.toLocaleString()}</strong></article>)}</div><p className="ranking-note">Rankings refresh every hour. Complete a challenge to help your college move up.</p></div>;
}

function Profile({ totalPoints, completed }: { totalPoints: number; completed: number }) {
  return <div className="page profile-page"><Header title="Profile" /><section className="profile-card"><div className="avatar">DZ</div><h2>Dannar Zharkyn</h2><p>College of Engineering</p><span>Challenge participant</span></section><div className="stats-grid"><article><span>✦</span><strong>{totalPoints.toLocaleString()}</strong><p>Total points</p></article><article><span>✓</span><strong>{completed}</strong><p>Completed</p></article><article><span>↗</span><strong>7</strong><p>Day streak</p></article></div><section className="achievement-section"><div className="section-title compact"><div><p className="eyebrow">MILESTONES</p><h2>Your badges</h2></div><span>3 earned</span></div><div className="badges"><div><i>☀</i><span>Early bird</span></div><div><i>♧</i><span>Team player</span></div><div><i>7</i><span>7-day streak</span></div><div className="locked"><i>?</i><span>Keep going</span></div></div></section><section className="profile-menu"><button><span>◎</span><div><strong>My activity</strong><small>See your challenge history</small></div><b>›</b></button><button><span>⚙</span><div><strong>Settings</strong><small>Notifications and preferences</small></div><b>›</b></button></section></div>;
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}><span>{icon}</span><small>{label}</small></button>;
}
