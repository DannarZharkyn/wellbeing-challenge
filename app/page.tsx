'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

type Tab = 'home' | 'challenges' | 'ranking' | 'profile';
type Category = 'Movement' | 'Mindfulness' | 'Connection' | 'Nutrition' | 'Rest & Recovery';

const categoryStyles: Record<Category, { icon: string; color: string }> = {
  Movement: { icon: '↗', color: '#4f806b' },
  Mindfulness: { icon: '◌', color: '#7b68a8' },
  Connection: { icon: '♧', color: '#5878a9' },
  Nutrition: { icon: '⌁', color: '#bd7358' },
  'Rest & Recovery': { icon: '☾', color: '#536c85' },
};

const badgeLevels = [
  { required: 1, label: 'Starter' },
  { required: 5, label: 'Intermediate' },
  { required: 15, label: 'Advanced' },
];

const badgeNames: Record<Category, string[]> = {
  Movement: ['First Step', 'Trail Maker', 'Movement Champion'],
  Mindfulness: ['Quiet Moment', 'Clear Mind', 'Mindfulness Master'],
  Connection: ['Friendly Hello', 'Community Builder', 'Connection Champion'],
  Nutrition: ['Fresh Start', 'Healthy Choice', 'Nutrition Hero'],
  'Rest & Recovery': ['Time to Pause', 'Rest Routine', 'Recovery Pro'],
};

const badgeImages: Record<Category, string> = {
  Movement: '/badges/movement.png',
  Mindfulness: '/badges/mindfulness.png',
  Connection: '/badges/connection.png',
  Nutrition: '/badges/nutrition.png',
  'Rest & Recovery': '/badges/rest-recovery.png',
};

const categoryLogoImages: Record<Category, string> = {
  Movement: '/category-logos/movement.png',
  Mindfulness: '/category-logos/mindfulness.png',
  Connection: '/category-logos/connection.png',
  Nutrition: '/category-logos/nutrition.png',
  'Rest & Recovery': '/category-logos/rest-recovery.png',
};

const challenges = [
  { id: 1, icon: '☀', title: 'Walk outside', detail: 'Fresh air, fresh perspective', info: 'Step away from your desk and take an easy walk outdoors. Notice the air, the sounds around you, and how your body feels as you move.', category: 'Movement' as Category, duration: 10, points: 50, color: 'mint' },
  { id: 2, icon: '♧', title: 'Run with a friend', detail: 'Wellbeing is better together', info: 'Invite a friend or classmate for a relaxed run. Keep a pace where you can still talk and encourage each other along the way.', category: 'Connection' as Category, duration: 20, points: 100, color: 'blue' },
  { id: 3, icon: '◌', title: 'Take a breathing break', detail: 'Reset and refocus your mind', info: 'Find a comfortable seat. Breathe in slowly for four counts, pause, then breathe out for four counts. Let your shoulders relax.', category: 'Mindfulness' as Category, duration: 5, points: 40, color: 'lavender' },
  { id: 4, icon: '✦', title: 'Practice gratitude', detail: 'A small moment of positivity', info: 'Think of one specific thing you appreciate today. Write it down or share it with someone who helped make it happen.', category: 'Connection' as Category, duration: 3, points: 30, color: 'peach' },
  { id: 5, icon: '⌁', title: 'Take a water break', detail: 'A simple healthy reset', info: 'Fill a glass or bottle with water, step away from your screen, and take a quiet moment to hydrate without distractions.', category: 'Nutrition' as Category, duration: 2, points: 25, color: 'aqua' },
  { id: 6, icon: '☾', title: 'Evening screen break', detail: 'Make space for better rest', info: 'Put your phone and laptop away. Lower the lights, stretch gently, or prepare for tomorrow while your mind winds down.', category: 'Rest & Recovery' as Category, duration: 15, points: 60, color: 'rest' },
  { id: 7, icon: '↗', title: 'Take the stairs', detail: 'Add movement to your routine', info: 'Choose the stairs instead of the elevator for one trip today. Move at a comfortable pace and notice your breathing.', category: 'Movement' as Category, duration: 5, points: 30, color: 'mint' },
  { id: 8, icon: '◇', title: 'Desk stretch', detail: 'Release tension between classes', info: 'Stand up and gently stretch your neck, shoulders, back, and legs. Avoid bouncing and keep every movement comfortable.', category: 'Movement' as Category, duration: 7, points: 35, color: 'mint' },
  { id: 9, icon: '◎', title: 'Mindful observation', detail: 'Notice what is around you', info: 'Choose one nearby object and study its color, shape, texture, and details. When your mind wanders, return your attention to it.', category: 'Mindfulness' as Category, duration: 5, points: 35, color: 'lavender' },
  { id: 10, icon: '☁', title: 'Guided body scan', detail: 'Reconnect with your body', info: 'Sit comfortably and move your attention slowly from your feet to your head, noticing sensations without trying to change them.', category: 'Mindfulness' as Category, duration: 10, points: 55, color: 'lavender' },
  { id: 11, icon: '♡', title: 'Check in with someone', detail: 'A small message can matter', info: 'Send a thoughtful message to a friend, classmate, or family member. Ask how they are doing and give them your full attention.', category: 'Connection' as Category, duration: 5, points: 40, color: 'blue' },
  { id: 12, icon: '♢', title: 'Add fruit to a meal', detail: 'Make one nourishing choice', info: 'Choose a piece of fruit or a serving of berries with a meal or snack. Take a moment to enjoy it without rushing.', category: 'Nutrition' as Category, duration: 5, points: 30, color: 'aqua' },
  { id: 13, icon: '○', title: 'Plan a balanced lunch', detail: 'Fuel the rest of your day', info: 'Plan a lunch with a source of protein, a grain or starch, and something colorful such as fruit or vegetables.', category: 'Nutrition' as Category, duration: 8, points: 45, color: 'aqua' },
  { id: 14, icon: '☾', title: 'Quiet reset', detail: 'Pause without a screen', info: 'Find a calm place, silence notifications, and let yourself rest without studying, scrolling, or multitasking.', category: 'Rest & Recovery' as Category, duration: 10, points: 45, color: 'rest' },
  { id: 15, icon: '⌁', title: 'Prepare for sleep', detail: 'Build a calmer bedtime', info: 'Dim the lights, set out what you need for tomorrow, and choose a consistent time to begin winding down tonight.', category: 'Rest & Recovery' as Category, duration: 12, points: 55, color: 'rest' },
];

const faculties = [
  { rank: 1, name: 'College of Arts & Sciences', points: 14820, badge: 'CAS', color: '#2f7e74' },
  { rank: 2, name: 'Questrom School of Business', points: 13740, badge: 'QST', color: '#bd7358' },
  { rank: 3, name: 'College of Engineering', points: 12840, badge: 'ENG', color: '#7b68a8' },
  { rank: 4, name: 'College of Communication', points: 11620, badge: 'COM', color: '#5878a9' },
  { rank: 5, name: 'Sargent College of Health & Rehabilitation Sciences', points: 10450, badge: 'SAR', color: '#9a7d44' },
  { rank: 6, name: 'Faculty of Computing & Data Sciences', points: 9780, badge: 'CDS', color: '#527d91' },
  { rank: 7, name: 'College of Fine Arts', points: 9210, badge: 'CFA', color: '#a15e73' },
  { rank: 8, name: 'Wheelock College of Education & Human Development', points: 8760, badge: 'WED', color: '#63875b' },
  { rank: 9, name: 'Frederick S. Pardee School of Global Studies', points: 8190, badge: 'PAR', color: '#846d9d' },
  { rank: 10, name: 'College of General Studies', points: 7640, badge: 'CGS', color: '#a06c4c' },
  { rank: 11, name: 'School of Hospitality Administration', points: 6980, badge: 'SHA', color: '#477b78' },
  { rank: 12, name: 'Arvind and Chandan Nandlal Kilachand Honors College', points: 6250, badge: 'KHC', color: '#756c62' },
];

export default function WellbeingApp() {
  const [tab, setTab] = useState<Tab>('home');
  const [completed, setCompleted] = useState<number[]>([3, 5]);
  const [selectedChallenge, setSelectedChallenge] = useState<number | null>(null);
  const totalPoints = 340 + completed.reduce((sum, id) => sum + (challenges.find((c) => c.id === id)?.points ?? 0), 0);

  function toggleChallenge(id: number) {
    setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <main className="app-shell">
      <div className="phone-frame">
        <section className="screen" aria-live="polite">
          {tab === 'home' && <Home totalPoints={totalPoints} completed={completed.length} onExplore={() => setTab('challenges')} />}
          {tab === 'challenges' && (selectedChallenge ? <ChallengeDetail challenge={challenges.find((item) => item.id === selectedChallenge)!} completed={completed.includes(selectedChallenge)} onBack={() => setSelectedChallenge(null)} onComplete={() => { if (!completed.includes(selectedChallenge)) toggleChallenge(selectedChallenge); }} /> : <Challenges completed={completed} onOpen={setSelectedChallenge} />)}
          {tab === 'ranking' && <Ranking />}
          {tab === 'profile' && <Profile totalPoints={totalPoints} completed={completed} />}
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
    <div className="hero-card"><div className="hero-copy"><h2>Small steps.<br/>Stronger together.</h2><button onClick={onExplore}>View challenges <span>→</span></button></div><div className="hero-art" aria-hidden="true"><span className="sun"/><span className="hill hill-one"/><span className="hill hill-two"/><Image className="terrier-mascot" src="/terrier-mascot-v2.png" alt="" width={1213} height={1296} priority /></div></div>
    <div className="section-title"><div><p className="eyebrow">YOUR PROGRESS</p><h2>Keep it going</h2></div><span className="week-label">Week 2 of 3</span></div>
    <div className="progress-card"><div className="ring" style={{'--progress': `${Math.min(88, 32 + completed * 9)}%`} as React.CSSProperties}><div><strong>{completed}</strong><span>done</span></div></div><div className="progress-info"><strong>{totalPoints.toLocaleString()}</strong><span>points earned</span><div className="bar"><i style={{width: `${Math.min(100, totalPoints / 8)}%`}}/></div><small>{Math.max(0, 800-totalPoints)} points to your next badge</small></div></div>
    <div className="section-title compact"><div><p className="eyebrow">COMING UP</p><h2>Wellbeing events</h2></div><button className="text-button">See all</button></div>
    <article className="event-card"><div className="event-date"><strong>28</strong><span>SEP</span></div><div><span className="pill">IN PERSON</span><h3>Campus wellbeing walk</h3><p>12:30 PM · Main Library steps</p></div><button className="round-button" aria-label="View event">→</button></article>
  </div>;
}

function Challenges({ completed, onOpen }: { completed: number[]; onOpen: (id: number) => void }) {
  const [filter, setFilter] = useState<Category | 'All'>('All');
  const visibleChallenges = filter === 'All' ? challenges : challenges.filter((challenge) => challenge.category === filter);

  return <div className="page"><Header title="Challenges" />
    <div className="filter-row">{(['All', ...Object.keys(categoryStyles)] as (Category | 'All')[]).map((category) => <button key={category} className={`filter ${filter === category ? 'active' : ''}`} onClick={() => setFilter(category)}>{category}</button>)}</div>
    <div className="challenge-summary"><div><strong>{completed.length}/{challenges.length}</strong><span>completed this week</span></div><div className="tiny-bar"><i style={{width: `${completed.length/challenges.length*100}%`}}/></div></div>
    <div className="challenge-list">{visibleChallenges.map((challenge) => { const done = completed.includes(challenge.id); return <article className={`challenge-card ${done ? 'done' : ''}`} key={challenge.id}><div className={`challenge-icon ${challenge.color}`}><Image src={categoryLogoImages[challenge.category]} alt="" width={1254} height={1254} /></div><div className="challenge-copy"><span className="category-label" style={{color: categoryStyles[challenge.category].color}}>{challenge.category}</span><h3>{challenge.title}</h3><p>{challenge.detail}</p><div className="challenge-meta"><span>◷ {challenge.duration} min</span><span>+{challenge.points} pts</span></div></div><button className="open-challenge" aria-label={`Open ${challenge.title}`} onClick={() => onOpen(challenge.id)}>{done ? '✓' : '›'}</button></article>; })}</div>
  </div>;
}

function ChallengeDetail({ challenge, completed, onBack, onComplete }: { challenge: typeof challenges[number]; completed: boolean; onBack: () => void; onComplete: () => void }) {
  const totalSeconds = challenge.duration * 60;
  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const finished = remaining === 0;

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((time) => Math.max(0, time - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [running, remaining]);

  useEffect(() => {
    if (finished && running) {
      setRunning(false);
      onComplete();
    }
  }, [finished, running, onComplete]);

  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
  const seconds = (remaining % 60).toString().padStart(2, '0');
  const progress = ((totalSeconds - remaining) / totalSeconds) * 100;

  return <div className="page challenge-detail-page">
    <button className="back-button" onClick={onBack}>← <span>Challenges</span></button>
    <div className={`detail-icon ${challenge.color}`}><Image src={categoryLogoImages[challenge.category]} alt="" width={1254} height={1254} /></div>
    <h1>{challenge.title}</h1>
    <div className="detail-tags"><span>{categoryStyles[challenge.category].icon} {challenge.category}</span><span>◷ {challenge.duration} minutes</span><span>✦ {challenge.points} points</span></div>
    <p className="detail-description">{challenge.info}</p>
    <section className={`timer-card ${running ? 'timer-running' : ''}`}>
      <p>{finished ? 'Challenge complete!' : running ? 'Time remaining' : completed ? 'Completed' : 'Ready when you are'}</p>
      <strong>{minutes}:{seconds}</strong>
      <div className="timer-track"><i style={{width: `${progress}%`}} /></div>
      {finished || completed ? <button className="primary-timer-button" onClick={onBack}>Back to challenges</button> : running ? <button className="quit-button" onClick={() => { setRunning(false); setRemaining(totalSeconds); }}>Quit challenge</button> : <button className="primary-timer-button" onClick={() => setRunning(true)}>Start challenge</button>}
    </section>
    <div className="timer-tip"><span>✓</span><p>Stay on this screen while the timer runs. Your points will be added when it reaches zero.</p></div>
  </div>;
}

function Ranking() {
  return <div className="page ranking-page"><Header title="College ranking" /><div className="ranking-hero"><span>WEEK 2</span><strong>118,280</strong><p>community points earned</p><div className="sparkles">✦　·　✦</div></div><div className="ranking-label"><span>RANK</span><span>COLLEGE</span><span>POINTS</span></div><div className="ranking-list">{faculties.map((faculty) => <article key={faculty.rank} className={faculty.badge === 'ENG' ? 'your-faculty' : ''}><strong className="rank-number">{faculty.rank}</strong><span className="faculty-badge" style={{background: faculty.color}}>{faculty.badge}</span><div><h3>{faculty.name}</h3>{faculty.badge === 'ENG' && <p>Your college</p>}</div><strong className="faculty-points">{faculty.points.toLocaleString()}</strong></article>)}</div><p className="ranking-note">Rankings refresh every hour. Complete a challenge to help your college move up.</p></div>;
}

function Profile({ totalPoints, completed }: { totalPoints: number; completed: number[] }) {
  const categoryCounts = challenges.reduce((counts, challenge) => {
    if (completed.includes(challenge.id)) counts[challenge.category] += 1;
    return counts;
  }, { Movement: 0, Mindfulness: 0, Connection: 0, Nutrition: 0, 'Rest & Recovery': 0 } as Record<Category, number>);
  const earned = Object.values(categoryCounts).reduce((sum, count) => sum + badgeLevels.filter((level) => count >= level.required).length, 0);

  return <div className="page profile-page"><Header title="Profile" /><section className="profile-card"><div className="avatar">DZ</div><h2>Dannar Zharkyn</h2><p>College of Engineering</p><span>Challenge participant</span></section><div className="stats-grid"><article><span>✦</span><strong>{totalPoints.toLocaleString()}</strong><p>Total points</p></article><article><span>✓</span><strong>{completed.length}</strong><p>Completed</p></article><article><span>↗</span><strong>7</strong><p>Day streak</p></article></div><section className="achievement-section"><div className="section-title compact"><div><h2>Badge collection</h2></div><span>{earned} of 15 earned</span></div><p className="badge-intro">Complete challenges in each category to unlock all three badge levels.</p><div className="badge-catalog">{(Object.keys(badgeNames) as Category[]).map((category) => <section className="badge-category" key={category}><div className="badge-category-title"><i><Image src={categoryLogoImages[category]} alt="" width={1254} height={1254} /></i><div><h3>{category}</h3><p>{categoryCounts[category]} completed</p></div></div><div className="badge-levels">{badgeLevels.map((level, index) => { const unlocked = categoryCounts[category] >= level.required; const progress = Math.min(100, categoryCounts[category] / level.required * 100); return <article className={unlocked ? 'badge-earned' : 'badge-locked'} key={level.label}><div className="badge-medallion"><Image src={badgeImages[category]} alt="" width={1254} height={1254} /><span className="badge-stars" aria-label={`Level ${index + 1}`}>{'★'.repeat(index + 1)}</span></div><div><strong>{badgeNames[category][index]}</strong><span>{unlocked ? 'Earned' : `${categoryCounts[category]}/${level.required} challenges`}</span><div className="badge-progress"><i style={{width: `${progress}%`, background: categoryStyles[category].color}} /></div></div></article>; })}</div></section>)}</div></section></div>;
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}><span>{icon}</span><small>{label}</small></button>;
}
