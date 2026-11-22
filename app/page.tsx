'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Dimension } from './prototype-data';
import { DimensionIcon, Icon, Logo } from './ui';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { calculateProfileTotals, calculateProgress } from '../lib/student-progress';
import {
  ActivityModal,
  type ActivityModalActivity,
  type TimedActivityAttempt,
} from './components/activity-modal';

type StudentTab = 'Home' | 'My Challenges' | 'Ranking' | 'Profile';
type StudentProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  college: string;
};
type Competition = {
  id: string;
  name: string;
  description: string;
  type: 'Group' | 'Individual';
  status: string;
  date: string;
  endAt: string;
  progress: number;
  activityCount: number;
  completedCount: number;
  points: number;
  teamName?: string;
  participantId?: string;
};
type RankingRow = {
  rank: number;
  id: string;
  name: string;
  points: number;
  completed: number;
  members?: number;
  current: boolean;
};
type JoinPreview = {
  competitionId: string;
  name: string;
  description: string;
  type: 'Group' | 'Individual';
  date: string;
  participants: number;
  activities: number;
};
type StudentActivity = ActivityModalActivity;
type StudentTeamMember = { id: string; name: string; points: number; current: boolean };
type CompletionProgress = { points: number; completedCount: number; activityCount: number };
type ActivityCache = Record<string, StudentActivity[]>;
type TeamCache = Record<string, StudentTeamMember[]>;
const profileKey = 'wellbeing-student-profile';
const studentTabKey = 'wellbeing-student-tab';
const studentCompetitionKey = 'wellbeing-student-competition';
const timedActivityKey = (profileId: string) => `wellbeing-timed-activity:${profileId}`;
const tabPaths: Record<StudentTab, string> = {
  Home: '/',
  'My Challenges': '/challenges',
  Ranking: '/ranking',
  Profile: '/profile',
};
const buSchools = [
  'Arvind & Chandan Nandlal Kilachand Honors College',
  'Chobanian & Avedisian School of Medicine',
  'College of Arts & Sciences',
  'College of Communication',
  'College of Engineering',
  'College of Fine Arts',
  'College of General Studies',
  'Faculty of Computing & Data Sciences',
  'Frederick S. Pardee School of Global Studies',
  'Graduate Medical Sciences',
  'Graduate School of Arts & Sciences',
  'Henry M. Goldman School of Dental Medicine',
  'Metropolitan College & Extended Education',
  'Questrom School of Business',
  'Sargent College of Health & Rehabilitation Sciences',
  'School of Hospitality Administration',
  'School of Law',
  'School of Public Health',
  'School of Social Work',
  'School of Theology',
  'Wheelock College of Education & Human Development',
];

function dates(start: string, end: string) {
  const format: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${new Date(start).toLocaleDateString('en-US', format)} – ${new Date(end).toLocaleDateString('en-US', format)}`;
}
function mapCompetition(row: Record<string, unknown>): Competition {
  const endAt = String(row.end_at);
  const ended =
    Number.isFinite(new Date(endAt).getTime()) && new Date(endAt).getTime() <= Date.now();
  return {
    id: String(row.competition_id ?? row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    type: row.competition_type === 'group' ? 'Group' : 'Individual',
    status: ended ? 'ended' : String(row.status),
    date: dates(String(row.start_at), endAt),
    endAt,
    progress: calculateProgress(Number(row.completed_count ?? 0), Number(row.activity_count ?? 0)),
    activityCount: Number(row.activity_count ?? 0),
    completedCount: Number(row.completed_count ?? 0),
    points: Number(row.points ?? 0),
    teamName: row.team_name ? String(row.team_name) : undefined,
    participantId: row.participant_id ? String(row.participant_id) : undefined,
  };
}
function fullDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
function completionDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
async function loadStudentTeam(profileId: string, competitionId: string) {
  const { data, error } = await getSupabaseBrowserClient()!.rpc('get_student_team_details', {
    p_profile_id: profileId,
    p_competition_id: competitionId,
  });
  if (error) return { code: '', members: [] as StudentTeamMember[] };
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    code: String(rows[0]?.team_code ?? ''),
    members: rows.map((row) => ({
      id: String(row.participant_id),
      name: String(row.display_name),
      points: Number(row.points),
      current: Boolean(row.is_current_student),
    })),
  };
}

/* DESIGN DECISION: Supabase competition and enrollment records are the student source of truth. Activities are returned only after a participation row exists. Group competition codes enroll an unassigned participant; team codes also attach the participant to that team. */
/* PROTOTYPE: A profile UUID remains in localStorage so this browser can act like a returning student without full authentication. */
/* TODO(PRODUCTION): Replace the local UUID with authenticated BU identity and enforce enrollment ownership, email verification, rate limits, and audit logs server-side. */
export default function StudentPlatform() {
  const client = getSupabaseBrowserClient();
  const [ready, setReady] = useState(false);
  const [competitionsReady, setCompetitionsReady] = useState(false);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [available, setAvailable] = useState<Competition[]>([]);
  const [joined, setJoined] = useState<Competition[]>([]);
  const [activityCache, setActivityCache] = useState<ActivityCache>({});
  const [teamCache, setTeamCache] = useState<TeamCache>({});
  const [tab, setTab] = useState<StudentTab>('Home');
  const [selected, setSelected] = useState<Competition | null>(null);
  const [routeCompetitionId, setRouteCompetitionId] = useState<string | null>(null);
  const [joinPreview, setJoinPreview] = useState<Competition | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [message, setMessage] = useState('');
  const syncRoute = useCallback(() => {
    const path = window.location.pathname;
    const detailId = path.match(/^\/challenges\/([^/]+)$/)?.[1] ?? null;
    const routeTab: StudentTab = path.startsWith('/challenges')
      ? 'My Challenges'
      : path === '/ranking'
        ? 'Ranking'
        : path === '/profile'
          ? 'Profile'
          : 'Home';
    setTab(routeTab);
    setRouteCompetitionId(detailId);
    if (detailId) localStorage.setItem(studentCompetitionKey, detailId);
    else setSelected(null);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem(profileKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<StudentProfile>;
        if (parsed.id) setProfile(parsed as StudentProfile);
        else localStorage.removeItem(profileKey);
      }
      syncRoute();
      setReady(true);
    }, 0);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', syncRoute);
    };
  }, [syncRoute]);
  const loadCompetitions = useCallback(
    async (profileId?: string) => {
      if (!client) {
        setCompetitionsReady(true);
        return;
      }
      const [{ data: publicRows }, { data: joinedRows }] = await Promise.all([
        client.rpc('list_public_individual_competitions'),
        profileId
          ? client.rpc('list_student_enrollments', { p_profile_id: profileId })
          : Promise.resolve({ data: [] }),
      ]);
      const enrollments: Competition[] = (joinedRows ?? []).map((row: Record<string, unknown>) =>
        mapCompetition(row),
      );
      const prepared = await Promise.all(
        enrollments.map(async (competition) => {
          if (competition.type === 'Group' && !competition.teamName)
            return {
              id: competition.id,
              activities: [] as StudentActivity[],
              members: [] as StudentTeamMember[],
            };
          const [{ data: activityRows }, team] = await Promise.all([
            client.rpc('list_enrolled_activities', {
              p_profile_id: profileId,
              p_competition_id: competition.id,
            }),
            competition.teamName && profileId
              ? loadStudentTeam(profileId, competition.id)
              : Promise.resolve({ code: '', members: [] as StudentTeamMember[] }),
          ]);
          return {
            id: competition.id,
            activities: (activityRows ?? []).map((row: Record<string, unknown>) =>
              mapActivity(row),
            ),
            members: team.members,
          };
        }),
      );
      setActivityCache(Object.fromEntries(prepared.map((item) => [item.id, item.activities])));
      setTeamCache(Object.fromEntries(prepared.map((item) => [item.id, item.members])));
      setJoined(enrollments);
      setAvailable(
        (publicRows ?? [])
          .map((row: Record<string, unknown>) => mapCompetition(row))
          .filter(
            (item: Competition) =>
              !enrollments.some((joinedItem: Competition) => joinedItem.id === item.id),
          ),
      );
      setCompetitionsReady(true);
    },
    [client],
  );
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void loadCompetitions(profile?.id), 0);
    return () => window.clearTimeout(timer);
  }, [ready, profile?.id, loadCompetitions]);
  // Route changes intentionally synchronize the selected competition after enrollment data is available.
  useEffect(() => {
    if (!competitionsReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(
      routeCompetitionId ? (joined.find((item) => item.id === routeCompetitionId) ?? null) : null,
    );
  }, [competitionsReady, joined, routeCompetitionId]);
  useEffect(() => {
    if (ready) localStorage.setItem(studentTabKey, tab);
  }, [ready, tab]);
  useEffect(() => {
    if (ready && selected) localStorage.setItem(studentCompetitionKey, selected.id);
  }, [ready, selected]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 4500);
    return () => window.clearTimeout(timer);
  }, [message]);
  async function register(input: Omit<StudentProfile, 'id'>) {
    if (!client) return;
    setMessage('');
    const { data, error } = await client.rpc('register_student_profile', {
      p_profile_id: null,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_email: input.email,
      p_college: input.college,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    const profileId = String(data);
    const { data: storedRows } = await client.rpc('get_student_profile', {
      p_profile_id: profileId,
    });
    const stored = storedRows?.[0];
    const next = stored
      ? {
          id: profileId,
          firstName: String(stored.first_name),
          lastName: String(stored.last_name),
          email: String(stored.email),
          college: String(stored.college),
        }
      : {
          ...input,
          id: profileId,
          firstName: capital(input.firstName),
          lastName: capital(input.lastName),
        };
    localStorage.setItem(profileKey, JSON.stringify(next));
    setCompetitionsReady(false);
    setMessage('');
    setProfile(next);
  }
  async function updateProfile(input: StudentProfile) {
    if (!client) return;
    setMessage('');
    const { error } = await client.rpc('register_student_profile', {
      p_profile_id: input.id,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_email: input.email,
      p_college: input.college,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    const next = {
      ...input,
      firstName: capital(input.firstName),
      lastName: capital(input.lastName),
    };
    localStorage.setItem(profileKey, JSON.stringify(next));
    setProfile(next);
    setMessage('Profile updated');
  }
  async function joinIndividual(id: string) {
    if (!client || !profile) return;
    const { error } = await client.rpc('join_individual_competition', {
      p_profile_id: profile.id,
      p_competition_id: id,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadCompetitions(profile.id);
    setMessage('Challenge joined');
  }
  async function leaveCompetition(id: string) {
    if (!client || !profile) return;
    const { error } = await client.rpc('leave_competition', {
      p_profile_id: profile.id,
      p_competition_id: id,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    localStorage.removeItem(studentCompetitionKey);
    setSelected(null);
    await loadCompetitions(profile.id);
    setMessage('You left the challenge');
  }
  function applyCompletion(
    competitionId: string,
    activityId: string,
    progress: CompletionProgress,
  ) {
    const update = (item: Competition) =>
      item.id === competitionId
        ? {
            ...item,
            points: progress.points,
            completedCount: progress.completedCount,
            activityCount: progress.activityCount,
            progress: calculateProgress(progress.completedCount, progress.activityCount),
          }
        : item;
    setJoined((current) => current.map(update));
    setSelected((current) => (current ? update(current) : current));
    setActivityCache((current) => ({
      ...current,
      [competitionId]: (current[competitionId] ?? []).map((item) =>
        item.id === activityId ? { ...item, completed: true } : item,
      ),
    }));
  }
  function navigate(value: StudentTab) {
    const savedId = localStorage.getItem(studentCompetitionKey);
    const savedCompetition =
      value === 'My Challenges' && savedId ? joined.find((item) => item.id === savedId) : undefined;
    window.history.pushState(
      {},
      '',
      savedCompetition ? `/challenges/${savedCompetition.id}` : tabPaths[value],
    );
    setTab(value);
    setRouteCompetitionId(savedCompetition?.id ?? null);
    setSelected(savedCompetition ?? null);
  }
  function openCompetition(item: Competition) {
    window.history.pushState({}, '', `/challenges/${item.id}`);
    setTab('My Challenges');
    setRouteCompetitionId(item.id);
    setSelected(item);
    localStorage.setItem(studentCompetitionKey, item.id);
  }
  function closeCompetition() {
    window.history.pushState({}, '', tabPaths['My Challenges']);
    setRouteCompetitionId(null);
    setSelected(null);
    localStorage.removeItem(studentCompetitionKey);
  }
  function logOut() {
    localStorage.removeItem(profileKey);
    localStorage.removeItem(studentTabKey);
    localStorage.removeItem(studentCompetitionKey);
    setMessage('');
    setProfile(null);
    setJoined([]);
    setAvailable([]);
    setActivityCache({});
    setTeamCache({});
    setSelected(null);
    setCompetitionsReady(false);
    setTab('Home');
    window.history.replaceState({}, '', tabPaths.Home);
  }
  if (!ready || (profile && !competitionsReady))
    return (
      <main className="student-app student-loading">
        <Logo />
        <span>Loading your experience…</span>
      </main>
    );
  if (!profile) return <RegistrationScreen onRegister={register} error={message} />;
  const initials = `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase();
  return (
    <main className="student-app">
      <header className="student-header">
        <Logo />
        <div className="student-header-actions">
          <a href="/admin" className="admin-link">
            Admin preview
          </a>
          <button className="avatar-button">{initials}</button>
        </div>
      </header>
      <div className="student-layout">
        <nav className="student-nav">
          <Navigation tab={tab} onChange={navigate} />
        </nav>
        <section className="student-content">
          {selected ? (
            <CompetitionDetail
              competition={selected}
              profile={profile}
              initialItems={activityCache[selected.id] ?? []}
              initialMembers={teamCache[selected.id] ?? []}
              onBack={closeCompetition}
              onLeave={async () => {
                await leaveCompetition(selected.id);
                navigate('My Challenges');
              }}
              onTeamChanged={async () => {
                setCompetitionsReady(false);
                await loadCompetitions(profile.id);
              }}
              onProgressChanged={(activityId, progress) =>
                applyCompletion(selected.id, activityId, progress)
              }
            />
          ) : (
            <>
              {tab === 'Home' && (
                <Home
                  profile={profile}
                  joined={joined}
                  available={available}
                  onExplore={() => navigate('My Challenges')}
                  onJoin={setJoinPreview}
                />
              )}{' '}
              {tab === 'My Challenges' && (
                <Challenges
                  joined={joined}
                  available={available}
                  onOpen={openCompetition}
                  onJoin={setJoinPreview}
                  onCode={() => setCodeOpen(true)}
                />
              )}{' '}
              {tab === 'Ranking' && <Ranking profile={profile} joined={joined} />}{' '}
              {tab === 'Profile' && (
                <Profile
                  profile={profile}
                  joined={joined}
                  onSave={updateProfile}
                  onLogOut={logOut}
                />
              )}
            </>
          )}
        </section>
      </div>
      <nav className="mobile-nav">
        <Navigation tab={tab} mobile onChange={navigate} />
      </nav>
      {joinPreview && (
        <JoinPreviewModal
          competition={joinPreview}
          onClose={() => setJoinPreview(null)}
          onConfirm={async () => {
            await joinIndividual(joinPreview.id);
            setJoinPreview(null);
            navigate('My Challenges');
          }}
        />
      )}
      {codeOpen && (
        <CodeModal
          profile={profile}
          joined={joined}
          onClose={() => setCodeOpen(false)}
          onJoined={async () => {
            setCodeOpen(false);
            await loadCompetitions(profile.id);
            navigate('My Challenges');
          }}
        />
      )}
      {message && (
        <div className="toast" role="status">
          <Icon name="check" />
          <span>{message}</span>
          <button aria-label="Dismiss notification" onClick={() => setMessage('')}>
            ×
          </button>
        </div>
      )}
    </main>
  );
}

function capital(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toUpperCase());
}
function Navigation({
  tab,
  onChange,
  mobile = false,
}: {
  tab: StudentTab;
  onChange: (tab: StudentTab) => void;
  mobile?: boolean;
}) {
  return (
    <>
      {(
        [
          ['Home', 'home'],
          ['My Challenges', 'target'],
          ['Ranking', 'trophy'],
          ['Profile', 'user'],
        ] as const
      ).map(([label, icon]) => (
        <button
          key={label}
          className={tab === label ? 'active' : ''}
          onClick={() => onChange(label)}
        >
          <Icon name={icon} />
          {mobile ? (
            <small>{label === 'My Challenges' ? 'Challenges' : label}</small>
          ) : (
            <span>{label}</span>
          )}
        </button>
      ))}
    </>
  );
}

function RegistrationScreen({
  onRegister,
  error,
}: {
  onRegister: (profile: Omit<StudentProfile, 'id'>) => void;
  error: string;
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', college: '' });
  const valid =
    form.firstName.trim().length > 1 &&
    form.lastName.trim().length > 1 &&
    /^\S+@\S+\.\S+$/.test(form.email) &&
    Boolean(form.college);
  return (
    <main className="student-app registration-screen">
      <section>
        <Logo />
        <div className="registration-welcome">
          <Image
            src="/terrier-mascot-v2.png"
            alt="Friendly Boston Terrier mascot"
            width={1213}
            height={1296}
            priority
            unoptimized
          />
          <span>WELCOME</span>
          <h1>Start your wellbeing journey</h1>
          <p>Register once to join real challenges created by Student Wellbeing.</p>
        </div>
        <div className="registration-form">
          <div className="registration-name-row">
            <label>
              First name
              <input
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              />
            </label>
            <label>
              Last name
              <input
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              />
            </label>
          </div>
          <label>
            Email address
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="name@bu.edu"
            />
          </label>
          <label>
            College
            <select
              value={form.college}
              onChange={(event) => setForm({ ...form, college: event.target.value })}
            >
              <option value="">Select your school or college</option>
              {buSchools.map((school) => (
                <option key={school}>{school}</option>
              ))}
            </select>
          </label>
          {error && <p className="code-error">{error}</p>}
          <button className="primary-button" disabled={!valid} onClick={() => onRegister(form)}>
            Get Started <Icon name="arrow" size={17} />
          </button>
          <small>No password is required for this prototype.</small>
        </div>
      </section>
    </main>
  );
}

function Home({
  profile,
  joined,
  available,
  onExplore,
  onJoin,
}: {
  profile: StudentProfile;
  joined: Competition[];
  available: Competition[];
  onExplore: () => void;
  onJoin: (item: Competition) => void;
}) {
  return (
    <div className="student-page">
      <div className="welcome-card">
        <div>
          <span>WELCOME</span>
          <h1>Welcome, {profile.firstName}!</h1>
          <p>
            {joined.length
              ? 'Your challenges and progress are ready when you are.'
              : 'Find a challenge that feels right for you.'}
          </p>
        </div>
        <Image
          src="/terrier-mascot-v2.png"
          alt="Friendly Boston Terrier mascot"
          width={1213}
          height={1296}
          priority
          unoptimized
        />
      </div>
      <section className="daily-quote">
        <Icon name="spark" />
        <div>
          <span>THOUGHT FOR TODAY</span>
          <p>Small steps still move you forward.</p>
        </div>
      </section>
      {!joined.length && (
        <section className="student-empty-home">
          <Icon name="target" />
          <h2>You&apos;re not participating in any challenges yet.</h2>
          <p>Explore available challenges and get started!</p>
          <button className="primary-button" onClick={onExplore}>
            Explore Challenges
          </button>
        </section>
      )}
      <SectionHeading title="Discover challenges" subtitle="Available individual competitions" />
      <AvailableList items={available} onJoin={onJoin} />
    </div>
  );
}

function AvailableList({
  items,
  onJoin,
}: {
  items: Competition[];
  onJoin: (item: Competition) => void;
}) {
  return (
    <div className="available-challenges">
      {items.length ? (
        items.map((item) => (
          <article className="public-competition-card" key={item.id}>
            <div>
              <span className="type-pill">
                <Icon name="user" size={14} />
                Individual
              </span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <small>
                <Icon name="clock" size={14} />
                {item.date}
              </small>
            </div>
            <button className="primary-button" onClick={() => onJoin(item)}>
              View & Join
            </button>
          </article>
        ))
      ) : (
        <div className="all-joined">
          <Icon name="check" />
          <span>No individual challenges are currently available.</span>
        </div>
      )}
    </div>
  );
}

function Challenges({
  joined,
  available,
  onOpen,
  onJoin,
  onCode,
}: {
  joined: Competition[];
  available: Competition[];
  onOpen: (item: Competition) => void;
  onJoin: (item: Competition) => void;
  onCode: () => void;
}) {
  const current = joined.filter((item) => item.status.toLowerCase() !== 'ended');
  const past = joined.filter((item) => item.status.toLowerCase() === 'ended');
  return (
    <div className="student-page">
      <PageIntro title="My challenges" />
      {current.length ? (
        <>
          <SectionHeading title="In progress" />
          <div className="competition-list">
            {current.map((item) => (
              <CompetitionCard key={item.id} competition={item} onClick={() => onOpen(item)} />
            ))}
          </div>
        </>
      ) : (
        !past.length && (
          <section className="challenges-empty">
            <Icon name="target" size={34} />
            <h2>You&apos;re not part of any challenges yet!</h2>
            <p>Explore an individual challenge or enter an invitation code.</p>
            <div>
              <a className="primary-button" href="#available-challenges">
                Explore Challenges
              </a>
              <button className="secondary-button" onClick={onCode}>
                Enter Code
              </button>
            </div>
          </section>
        )
      )}
      <div className="challenge-actions">
        <button onClick={onCode}>
          <Icon name="target" />
          Enter Code
        </button>
      </div>
      {past.length > 0 && (
        <section className="past-challenges">
          <SectionHeading title="Past challenges" subtitle="Your completed challenge history" />
          <div className="past-challenge-list">
            {past.map((item) => (
              <PastCompetitionCard key={item.id} competition={item} onClick={() => onOpen(item)} />
            ))}
          </div>
        </section>
      )}
      <section id="available-challenges">
        <SectionHeading title="Explore challenges" subtitle="Available individual competitions" />
        <AvailableList items={available} onJoin={onJoin} />
      </section>
    </div>
  );
}
function CompetitionCard({
  competition,
  onClick,
}: {
  competition: Competition;
  onClick: () => void;
}) {
  return (
    <button
      className="competition-card circular-card"
      onClick={onClick}
      style={
        {
          '--accent': '#397760',
          '--progress': `${competition.progress * 3.6}deg`,
        } as React.CSSProperties
      }
    >
      <div className="competition-card-copy">
        <div className="competition-card-top">
          <span className="type-pill">
            <Icon name={competition.type === 'Group' ? 'users' : 'user'} size={14} />
            {competition.type}
          </span>
          <Icon name="chevron" />
        </div>
        <h3>{competition.name}</h3>
        {competition.teamName && <p className="team-name">Team · {competition.teamName}</p>}
        <div className="competition-date">
          <Icon name="clock" size={14} />
          {competition.date}
        </div>
      </div>
      <div className="progress-ring">
        <span>
          <strong>{competition.progress}%</strong>
          <small>complete</small>
        </span>
      </div>
    </button>
  );
}
function PastCompetitionCard({
  competition,
  onClick,
}: {
  competition: Competition;
  onClick: () => void;
}) {
  return (
    <button className="past-challenge-card" onClick={onClick}>
      <span className="past-challenge-icon">
        <Icon name="trophy" />
      </span>
      <div>
        <span className="past-status">FINISHED</span>
        <h3>{competition.name}</h3>
        <p>
          {competition.type}
          {competition.teamName ? ` · ${competition.teamName}` : ''}
        </p>
        <small>Ended {fullDate(competition.endAt)}</small>
      </div>
      <div className="past-challenge-result">
        <strong>{competition.points.toLocaleString()}</strong>
        <span>points</span>
        <small>{competition.progress}% complete</small>
      </div>
      <Icon name="chevron" size={17} />
    </button>
  );
}

function mapJoinPreview(row: Record<string, unknown>): JoinPreview {
  return {
    competitionId: String(row.competition_id),
    name: String(row.name),
    description: String(row.description ?? ''),
    type: row.competition_type === 'group' ? 'Group' : 'Individual',
    date: dates(String(row.start_at), String(row.end_at)),
    participants: Number(row.participant_count ?? 0),
    activities: Number(row.activity_count ?? 0),
  };
}
function PreviewDetails({ preview }: { preview: JoinPreview }) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const description = preview.description || 'No additional description has been provided.';
  const hasLongDescription = description.length > 180;

  return (
    <>
      <div className="join-description-wrap">
        <p className={`join-description${descriptionExpanded ? ' is-expanded' : ''}`}>
          {description}
        </p>
        {hasLongDescription && (
          <button
            className="join-description-toggle"
            type="button"
            aria-expanded={descriptionExpanded}
            onClick={() => setDescriptionExpanded((expanded) => !expanded)}
          >
            {descriptionExpanded ? 'Show less' : 'More'}
          </button>
        )}
      </div>
      <div className="join-preview-stats">
        <article>
          <Icon name="users" />
          <strong>{preview.participants}</strong>
          <span>Participants</span>
        </article>
        <article>
          <Icon name="target" />
          <strong>{preview.activities}</strong>
          <span>Activities</span>
        </article>
        <article>
          <Icon name="clock" />
          <strong>{preview.date}</strong>
          <span>Duration</span>
        </article>
      </div>
    </>
  );
}
function JoinPreviewModal({
  competition,
  onClose,
  onConfirm,
}: {
  competition: Competition;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  useEffect(() => {
    getSupabaseBrowserClient()
      ?.rpc('get_competition_join_preview', { p_competition_id: competition.id })
      .then(({ data }) => {
        if (data?.[0]) setPreview(mapJoinPreview(data[0] as Record<string, unknown>));
      });
  }, [competition.id]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="join-preview-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <Icon name="close" />
        </button>
        <span className="type-pill">
          <Icon name="user" size={14} />
          Individual challenge
        </span>
        <h2>{competition.name}</h2>
        {preview ? (
          <PreviewDetails preview={preview} />
        ) : (
          <div className="competition-loading">Loading challenge details…</div>
        )}
        <div className="join-preview-actions">
          <button className="secondary-button" onClick={onClose}>
            Not now
          </button>
          <button className="primary-button" disabled={!preview} onClick={onConfirm}>
            Join challenge
          </button>
        </div>
      </section>
    </div>
  );
}

function CodeModal({
  profile,
  joined,
  onClose,
  onJoined,
}: {
  profile: StudentProfile;
  joined: Competition[];
  onClose: () => void;
  onJoined: () => void;
}) {
  const client = getSupabaseBrowserClient();
  const [code, setCode] = useState('');
  const [match, setMatch] = useState<{
    competition_id: string;
    competition_name: string;
    competition_type: 'individual' | 'group';
    team_name: string | null;
  } | null>(null);
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [error, setError] = useState('');
  async function find() {
    const { data, error: findError } = await client!.rpc('find_competition_by_code', {
      p_code: code,
    });
    const found = data?.[0];
    if (findError || !found) {
      setError('That code is not valid.');
      setMatch(null);
      return;
    }
    if (joined.some((item) => item.id === found.competition_id)) {
      setError('You already joined this competition.');
      return;
    }
    const { data: previewRows } = await client!.rpc('get_competition_join_preview', {
      p_competition_id: found.competition_id,
    });
    setPreview(previewRows?.[0] ? mapJoinPreview(previewRows[0] as Record<string, unknown>) : null);
    setError('');
    setMatch(found);
  }
  async function join() {
    const { error: joinError } = await client!.rpc('join_competition_by_code', {
      p_profile_id: profile.id,
      p_code: code,
    });
    if (joinError) {
      setError(joinError.message);
      return;
    }
    onJoined();
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="group-code-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <Icon name="close" />
        </button>
        <span className="modal-icon">
          <Icon name="target" />
        </span>
        <h2>Enter code</h2>
        <p>
          Enter an individual or group competition code, or use a team-specific code to join that
          team directly. Ask a teammate or the organizer for the right code.
        </p>
        {!match ? (
          <>
            <label>
              Code
              <input
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  setError('');
                }}
              />
            </label>
            {error && <p className="code-error">{error}</p>}
            <button className="primary-button" disabled={!code.trim()} onClick={find}>
              Continue
            </button>
          </>
        ) : (
          <div className="code-confirm">
            <span>{match.competition_type.toUpperCase()} COMPETITION FOUND</span>
            <h3>{match.competition_name}</h3>
            <p>
              {match.competition_type === 'individual'
                ? 'You will join as an individual participant.'
                : match.team_name
                  ? `Team · ${match.team_name}`
                  : 'You will join as an unassigned participant until the organizer assigns a team.'}
            </p>
            {preview && <PreviewDetails preview={preview} />}
            <button className="primary-button" onClick={join}>
              Join competition
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setMatch(null);
                setPreview(null);
              }}
            >
              Use another code
            </button>
            {error && <p className="code-error">{error}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function CompetitionDetail({
  competition,
  profile,
  initialItems,
  initialMembers,
  onBack,
  onLeave,
  onTeamChanged,
  onProgressChanged,
}: {
  competition: Competition;
  profile: StudentProfile;
  initialItems: StudentActivity[];
  initialMembers: StudentTeamMember[];
  onBack: () => void;
  onLeave: () => void;
  onTeamChanged: () => Promise<void>;
  onProgressChanged: (activityId: string, progress: CompletionProgress) => void;
}) {
  const client = getSupabaseBrowserClient();
  const ended = competition.status.toLowerCase() === 'ended';
  const waitingForTeam = !ended && competition.type === 'Group' && !competition.teamName;
  const [items, setItems] = useState<StudentActivity[]>(initialItems);
  const [loadError, setLoadError] = useState('');
  const [finalError, setFinalError] = useState('');
  const [active, setActive] = useState<StudentActivity | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [finalResult, setFinalResult] = useState<{
    winnerName: string;
    winnerPoints: number;
    rank: number | null;
    name: string;
    points: number;
    completed: number;
  } | null>(null);
  const longDescription = competition.description.length > 150;
  const timerStorageKey = timedActivityKey(profile.id);

  useEffect(() => {
    if (active || ended) return;
    try {
      const stored = JSON.parse(sessionStorage.getItem(timerStorageKey) ?? '') as {
        competitionId?: string;
        activityId?: string;
      };
      if (stored.competitionId !== competition.id) return;
      const restoredActivity = items.find(
        (item) => item.id === stored.activityId && item.type === 'Timed' && !item.completed,
      );
      if (!restoredActivity) return;
      // Route restoration happens after enrollment data loads; reopen the active timer afterward.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(restoredActivity);
    } catch {
      // Missing or invalid tab state means there is no resumable timer in this tab.
    }
  }, [active, competition.id, ended, items, timerStorageKey]);
  useEffect(() => {
    if (!ended) return;
    client
      ?.rpc('get_final_competition_result', {
        p_profile_id: profile.id,
        p_competition_id: competition.id,
      })
      .then(({ data, error }) => {
        const result = data?.[0] as Record<string, unknown> | undefined;
        if (error) {
          setFinalError('Final results could not be loaded.');
          return;
        }
        if (result)
          setFinalResult({
            winnerName: String(result.winner_name),
            winnerPoints: Number(result.winner_points),
            rank: result.current_rank == null ? null : Number(result.current_rank),
            name: String(result.current_name ?? ''),
            points: Number(result.current_points ?? competition.points),
            completed: Number(result.current_completed ?? competition.completedCount),
          });
      });
  }, [client, competition.completedCount, competition.id, competition.points, ended, profile.id]);
  async function complete(activity: StudentActivity, attemptToken?: string) {
    if (ended || activity.completed) return;
    setLoadError('');
    if (activity.type === 'Timed' && !attemptToken)
      throw new Error('Start the activity timer before completing this activity.');
    const rpc =
      activity.type === 'Timed'
        ? 'complete_timed_activity_with_progress'
        : 'complete_activity_with_progress';
    const { data, error } = await client!.rpc(rpc, {
      p_profile_id: profile.id,
      p_competition_id: competition.id,
      p_activity_id: activity.id,
      ...(attemptToken ? { p_attempt_token: attemptToken } : {}),
    });
    if (error) {
      setLoadError(error.message);
      throw new Error(error.message);
    }
    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) =>
        item.id === activity.id ? { ...item, completed: true, completedAt: now } : item,
      ),
    );
    const result = data?.[0];
    if (result)
      onProgressChanged(activity.id, {
        points: Number(result.participant_points),
        completedCount: Number(result.completed_count),
        activityCount: Number(result.activity_count),
      });
  }
  const startTimedActivity = useCallback(
    async (activityId: string): Promise<TimedActivityAttempt> => {
      const { data, error } = await client!.rpc('start_timed_activity', {
        p_profile_id: profile.id,
        p_competition_id: competition.id,
        p_activity_id: activityId,
      });
      const result = data?.[0];
      if (error || !result) throw new Error(error?.message ?? 'The timer could not be started.');
      return {
        token: String(result.attempt_token),
        startedAt: String(result.started_at),
        readyAt: String(result.ready_at),
      };
    },
    [client, competition.id, profile.id],
  );
  const resumeTimedActivity = useCallback(
    async (activityId: string, token: string): Promise<TimedActivityAttempt | null> => {
      const { data, error } = await client!.rpc('get_timed_activity_attempt', {
        p_profile_id: profile.id,
        p_competition_id: competition.id,
        p_activity_id: activityId,
        p_attempt_token: token,
      });
      if (error) throw new Error(error.message);
      const result = data?.[0];
      return result
        ? {
            token: String(result.attempt_token),
            startedAt: String(result.started_at),
            readyAt: String(result.ready_at),
          }
        : null;
    },
    [client, competition.id, profile.id],
  );
  const cancelTimedActivity = useCallback(
    async (token: string) => {
      const { error } = await client!.rpc('cancel_timed_activity', {
        p_profile_id: profile.id,
        p_attempt_token: token,
      });
      if (error) throw new Error(error.message);
    },
    [client, profile.id],
  );
  const timedControls = useMemo(
    () =>
      active?.type === 'Timed'
        ? {
            storageKey: timerStorageKey,
            competitionId: competition.id,
            start: () => startTimedActivity(active.id),
            resume: (token: string) => resumeTimedActivity(active.id, token),
            cancel: cancelTimedActivity,
          }
        : undefined,
    [
      active,
      cancelTimedActivity,
      competition.id,
      resumeTimedActivity,
      startTimedActivity,
      timerStorageKey,
    ],
  );
  const completedItems = items.filter((item) => item.completed);
  const completed = completedItems.length;
  const progress = ended ? competition.progress : calculateProgress(completed, items.length);
  return (
    <div className="student-page competition-detail">
      <button className="back-link" onClick={onBack}>
        ← Back
      </button>
      <section className={`competition-detail-hero compact${ended ? ' past-hero' : ''}`}>
        <span className="competition-kind">{ended ? 'Finished challenge' : competition.type}</span>
        <h1>{competition.name}</h1>
        {competition.description && (
          <>
            <p className={descriptionOpen ? 'description-open' : 'description-collapsed'}>
              {competition.description}
            </p>
            {longDescription && (
              <button
                className="description-toggle"
                onClick={() => setDescriptionOpen((value) => !value)}
              >
                {descriptionOpen ? 'Show less' : 'More'}
              </button>
            )}
          </>
        )}
        <div>
          <span>{ended ? `Ended ${fullDate(competition.endAt)}` : competition.date}</span>
          {competition.teamName && <span>Team · {competition.teamName}</span>}
        </div>
      </section>
      {ended && (
        <section className="final-results-card">
          <div>
            <span>YOUR FINAL RESULT</span>
            <strong>{finalResult?.rank ? `#${finalResult.rank}` : '—'}</strong>
            <small>
              {finalResult?.completed ?? competition.completedCount} activities ·{' '}
              {(finalResult?.points ?? competition.points).toLocaleString()} points
            </small>
          </div>
          <div className="final-winner">
            <Icon name="trophy" />
            <span>WINNER</span>
            <strong>{finalResult?.winnerName ?? '—'}</strong>
            <small>
              {finalError ||
                (finalResult
                  ? `${finalResult.winnerPoints.toLocaleString()} points`
                  : 'Loading final result…')}
            </small>
          </div>
        </section>
      )}
      {waitingForTeam ? (
        <TeamChoice
          profileId={profile.id}
          competitionId={competition.id}
          onChanged={onTeamChanged}
        />
      ) : (
        <>
          <div className="detail-stat-row">
            <article>
              <span>Progress</span>
              <strong>{progress}%</strong>
            </article>
            <article>
              <span>{ended ? 'Points' : 'To do'}</span>
              <strong>
                {ended ? competition.points : items.filter((item) => !item.completed).length}
              </strong>
            </article>
            <article>
              <span>Completed</span>
              <strong>{completed}</strong>
            </article>
          </div>
          {competition.type === 'Group' && competition.teamName && (
            <StudentTeamDetails
              profileId={profile.id}
              competitionId={competition.id}
              teamName={competition.teamName}
              refreshKey={competition.points}
              initialMembers={initialMembers}
              onChanged={onTeamChanged}
            />
          )}
          <SectionHeading
            title={ended ? 'Completed activities' : 'Activities'}
            subtitle={
              ended ? 'Your activity history from this challenge' : 'Browse by wellbeing dimension'
            }
          />
          {loadError ? (
            <div className="library-error">{loadError}</div>
          ) : ended ? (
            <ActivityList items={completedItems} onOpen={setActive} />
          ) : (
            <CategorizedActivityList items={items} onOpen={setActive} />
          )}
        </>
      )}
      {!ended && (
        <button className="leave-challenge" onClick={onLeave}>
          Quit challenge
        </button>
      )}
      {active && (
        <ActivityModal
          activity={active}
          onClose={() => setActive(null)}
          onComplete={(attemptToken) => complete(active, attemptToken)}
          timedControls={timedControls}
        />
      )}
    </div>
  );
}

function TeamChoice({
  profileId,
  competitionId,
  onChanged,
}: {
  profileId: string;
  competitionId: string;
  onChanged: () => Promise<void>;
}) {
  const client = getSupabaseBrowserClient();
  const [mode, setMode] = useState<'choices' | 'create' | 'join'>('choices');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  async function submit() {
    if (!value.trim() || !client) return;
    setWorking(true);
    setError('');
    const rpc = mode === 'create' ? 'create_student_team' : 'join_student_team';
    const args =
      mode === 'create'
        ? { p_profile_id: profileId, p_competition_id: competitionId, p_team_name: value }
        : { p_profile_id: profileId, p_competition_id: competitionId, p_team_code: value };
    const { error: actionError } = await client.rpc(rpc, args);
    if (actionError) {
      setError(actionError.message);
      setWorking(false);
      return;
    }
    await onChanged();
    setWorking(false);
  }
  return (
    <section className="team-choice">
      <header>
        <Icon name="users" size={30} />
        <div>
          <h2>Choose how to join a team</h2>
          <p>Activities unlock after you become part of a team.</p>
        </div>
      </header>
      {mode === 'choices' ? (
        <div className="team-choice-grid">
          <button
            onClick={() => {
              setMode('create');
              setValue('');
            }}
          >
            <Icon name="plus" />
            <strong>Create your own team</strong>
            <span>Choose a unique team name and receive a team code.</span>
          </button>
          <button
            onClick={() => {
              setMode('join');
              setValue('');
            }}
          >
            <Icon name="target" />
            <strong>Enter a team code</strong>
            <span>Join a team that already exists in this competition.</span>
          </button>
          <div className="team-choice-wait-note">
            <Icon name="clock" size={17} />
            <span>Or wait for the organizer to place you on a team.</span>
          </div>
        </div>
      ) : (
        <div className="team-choice-form">
          <button
            className="back-link"
            onClick={() => {
              setMode('choices');
              setError('');
            }}
          >
            ← Back
          </button>
          <label>
            {mode === 'create' ? 'Team name' : 'Team code'}
            <input
              autoFocus
              value={value}
              maxLength={80}
              onChange={(event) =>
                setValue(mode === 'join' ? event.target.value.toUpperCase() : event.target.value)
              }
              placeholder={mode === 'create' ? 'e.g. Charles River Crew' : 'Enter 6-character code'}
            />
          </label>
          {error && <p className="code-error">{error}</p>}
          <button
            className="primary-button"
            disabled={working || value.trim().length < 2}
            onClick={submit}
          >
            {working ? 'Saving…' : mode === 'create' ? 'Create team' : 'Join team'}
          </button>
        </div>
      )}
    </section>
  );
}

function StudentTeamDetails({
  profileId,
  competitionId,
  teamName,
  refreshKey,
  initialMembers,
  onChanged,
}: {
  profileId: string;
  competitionId: string;
  teamName: string;
  refreshKey: number;
  initialMembers: StudentTeamMember[];
  onChanged: () => Promise<void>;
}) {
  const client = getSupabaseBrowserClient();
  const [members, setMembers] = useState<StudentTeamMember[]>(initialMembers);
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    const team = await loadStudentTeam(profileId, competitionId);
    setMembers(team.members);
    setCode(team.code);
  }, [competitionId, profileId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload, refreshKey]);
  async function remove(member: StudentTeamMember) {
    if (!client || !window.confirm(`Remove ${member.name} from this team?`)) return;
    setWorking(true);
    setError('');
    const { error: removeError } = await client.rpc('remove_student_team_member', {
      p_profile_id: profileId,
      p_competition_id: competitionId,
      p_participant_id: member.id,
    });
    if (removeError) {
      setError(removeError.message);
      setWorking(false);
      return;
    }
    if (member.current) await onChanged();
    else await reload();
    setWorking(false);
  }
  return (
    <section className="student-team-card">
      <button onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <div>
          <span>MY TEAM</span>
          <h2>{teamName}</h2>
          <p>
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </p>
        </div>
        <span className="student-team-count">
          <Icon name="users" size={18} />
          {members.length}
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open && (
        <div className="student-team-members">
          <div className="student-team-code">
            <span>TEAM CODE</span>
            <strong>{code || 'Loading…'}</strong>
            <button onClick={() => navigator.clipboard.writeText(code)}>Copy</button>
          </div>
          {error && <p className="code-error">{error}</p>}
          {members.map((member) => (
            <article key={member.id}>
              <span>
                {member.name
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              <div>
                <strong>
                  {member.name}
                  {member.current ? ' (You)' : ''}
                </strong>
              </div>
              <b>{member.points} pts</b>
              <button
                className="student-member-remove"
                disabled={working}
                aria-label={`Remove ${member.name}`}
                onClick={() => remove(member)}
              >
                <Icon name="trash" size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function mapActivity(row: Record<string, unknown>): StudentActivity {
  return {
    id: String(row.id),
    title: String(row.title),
    detail: String(row.description ?? ''),
    dimension: String(row.dimension) as Dimension,
    type: row.completion_type === 'timed' ? 'Timed' : 'Daily check-in',
    duration: Number(row.duration_minutes ?? 0),
    points: Number(row.points),
    completed: Boolean(row.completed),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  };
}
function ActivityList({
  items,
  onOpen,
}: {
  items: StudentActivity[];
  onOpen?: (item: StudentActivity) => void;
}) {
  return (
    <div className="quick-actions">
      {items.length ? (
        items.map((item) => (
          <article key={item.id}>
            <DimensionIcon dimension={item.dimension} />
            <div>
              <span>{item.dimension}</span>
              <h3>{item.title}</h3>
              <small>
                {item.completedAt
                  ? `Completed ${completionDate(item.completedAt)} · +${item.points} pts`
                  : item.completed
                    ? 'Completed'
                    : `${item.type === 'Timed' ? `${item.duration} min` : 'Daily check-in'} · +${item.points} pts`}
              </small>
            </div>
            {onOpen && (
              <button onClick={() => onOpen(item)}>
                {item.completed ? <Icon name="check" /> : <Icon name="chevron" />}
              </button>
            )}
          </article>
        ))
      ) : (
        <div className="all-joined">
          <span>No completed activities were recorded.</span>
        </div>
      )}
    </div>
  );
}
function CategorizedActivityList({
  items,
  onOpen,
}: {
  items: StudentActivity[];
  onOpen: (item: StudentActivity) => void;
}) {
  const [view, setView] = useState<'todo' | 'completed'>('todo');
  const shown = items.filter((item) => (view === 'completed' ? item.completed : !item.completed));
  const groups = shown.reduce(
    (result, item) => {
      (result[item.dimension] ??= []).push(item);
      return result;
    },
    {} as Partial<Record<Dimension, StudentActivity[]>>,
  );
  return (
    <div className="categorized-activities">
      <div className="activity-view-tabs">
        <button className={view === 'todo' ? 'active' : ''} onClick={() => setView('todo')}>
          To do <span>{items.filter((item) => !item.completed).length}</span>
        </button>
        <button
          className={view === 'completed' ? 'active' : ''}
          onClick={() => setView('completed')}
        >
          Completed <span>{items.filter((item) => item.completed).length}</span>
        </button>
      </div>
      <div className="activity-scroll">
        {Object.entries(groups).map(([dimension, activities]) => (
          <section className="dimension-activity-group" key={dimension}>
            <header>
              <DimensionIcon dimension={dimension as Dimension} />
              <div>
                <h3>{dimension}</h3>
                <span>
                  {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
                </span>
              </div>
            </header>
            <ActivityList items={activities} onOpen={onOpen} />
          </section>
        ))}
        {!shown.length && (
          <div className="activity-empty-state">
            <Icon name={view === 'completed' ? 'target' : 'check'} size={30} />
            <strong>
              {view === 'completed' ? 'No completed activities yet' : 'Everything is completed!'}
            </strong>
            <span>
              {view === 'completed'
                ? 'Activities will move here after you finish them.'
                : 'Great work—you completed every activity.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
function Ranking({ profile, joined }: { profile: StudentProfile; joined: Competition[] }) {
  const [mode, setMode] = useState<'Individual' | 'Group'>('Individual');
  const joinedInMode = joined.filter((item) => item.type === mode);
  const competitions = joinedInMode.filter(
    (item) => mode === 'Individual' || Boolean(item.teamName),
  );
  const waitingForTeam = mode === 'Group' && joinedInMode.length > 0 && !competitions.length;
  const [selectedId, setSelectedId] = useState('');
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const selected = competitions.find((item) => item.id === selectedId) ?? competitions[0];
  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const rpc =
        mode === 'Individual'
          ? 'get_individual_competition_leaderboard'
          : 'get_team_competition_leaderboard';
      getSupabaseBrowserClient()
        ?.rpc(rpc, { p_profile_id: profile.id, p_competition_id: selected.id })
        .then(({ data, error: loadError }) => {
          if (loadError) {
            setError(loadError.message);
            setRows([]);
          } else
            setRows(
              (data ?? []).map((row: Record<string, unknown>) => ({
                rank: Number(row.rank),
                id: String(row.participant_id ?? row.team_id),
                name: String(row.display_name ?? row.team_name),
                points: Number(row.points ?? 0),
                completed: Number(row.completed_count ?? 0),
                members: row.member_count === undefined ? undefined : Number(row.member_count),
                current: Boolean(row.is_current_student ?? row.is_current_team),
              })),
            );
          setLoading(false);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, profile.id, selected]);
  return (
    <div className="student-page ranking-page">
      <PageIntro title="Ranking" />
      <div className="segmented">
        <button
          className={mode === 'Individual' ? 'active' : ''}
          onClick={() => {
            setMode('Individual');
            setSelectedId('');
            setRows([]);
          }}
        >
          Individuals
        </button>
        <button
          className={mode === 'Group' ? 'active' : ''}
          onClick={() => {
            setMode('Group');
            setSelectedId('');
            setRows([]);
          }}
        >
          Teams
        </button>
      </div>
      {!competitions.length ? (
        <section className="challenges-empty">
          <Icon name={mode === 'Group' ? 'users' : 'trophy'} size={34} />
          <h2>
            {waitingForTeam
              ? 'You’re not part of a team yet'
              : mode === 'Group'
                ? 'You are not in a team challenge'
                : 'No individual rankings yet'}
          </h2>
          <p>
            {waitingForTeam
              ? 'Wait for the organizer to assign you to a team. Team rankings will appear after you are assigned.'
              : mode === 'Group'
                ? 'Join a group competition to see team rankings.'
                : 'Join an individual challenge to see its leaderboard.'}
          </p>
        </section>
      ) : (
        <>
          <div className="ranking-picker">
            <span>{mode} challenges</span>
            {competitions.map((item) => (
              <button
                key={item.id}
                className={selected?.id === item.id ? 'active' : ''}
                onClick={() => setSelectedId(item.id)}
              >
                <Icon name={mode === 'Group' ? 'users' : 'target'} size={19} />
                <strong>{item.name}</strong>
                <Icon name="check" size={17} />
              </button>
            ))}
          </div>
          {selected && (
            <section className="ranking-summary">
              <div>
                <span>YOUR PROGRESS</span>
                <strong>{selected.progress}%</strong>
                <small>
                  {selected.completedCount} of {selected.activityCount} activities
                </small>
              </div>
              <div>
                <span>YOUR POINTS</span>
                <strong>{selected.points.toLocaleString()}</strong>
                <small>Updated after every completion</small>
              </div>
            </section>
          )}
          <Leaderboard rows={rows} mode={mode} loading={loading} error={error} />
        </>
      )}
    </div>
  );
}
function Leaderboard({
  rows,
  mode,
  loading,
  error,
}: {
  rows: RankingRow[];
  mode: 'Individual' | 'Group';
  loading: boolean;
  error: string;
}) {
  if (loading) return <div className="competition-loading">Loading live rankings…</div>;
  if (error)
    return (
      <div className="library-error">
        Rankings are temporarily unavailable. Please try again shortly.
      </div>
    );
  if (!rows.length)
    return (
      <section className="challenges-empty compact-empty">
        <Icon name="trophy" size={30} />
        <h2>No ranking data yet</h2>
        <p>
          {mode === 'Group'
            ? 'Teams will appear after the organizer creates them.'
            : 'Participants will appear as students join.'}
        </p>
      </section>
    );
  const podium = rows.slice(0, 3);
  return (
    <>
      <div className="ranking-podium">
        {podium.map((row) => (
          <article key={row.id} className={`place-${row.rank}${row.current ? ' current' : ''}`}>
            <span className="podium-crown">{row.rank === 1 ? '♛' : '★'}</span>
            <div className="podium-person">
              {row.name
                .split(/\s+/)
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </div>
            <strong>{row.name}</strong>
            <small>
              #{row.rank} · {row.points.toLocaleString()} pts
            </small>
          </article>
        ))}
      </div>
      <div className="leader-table live-leaderboard">
        {rows.map((row) => (
          <article key={row.id} className={row.current ? 'you' : ''}>
            <strong>{row.rank}</strong>
            <span className="row-avatar">
              {row.name
                .split(/\s+/)
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </span>
            <div>
              <h3>
                {row.name}
                {row.current && <em>You</em>}
              </h3>
              <p>
                {mode === 'Group' ? `${row.members ?? 0} members · ` : ''}
                {row.completed} activities completed
              </p>
            </div>
            <b>{row.points.toLocaleString()} pts</b>
          </article>
        ))}
      </div>
    </>
  );
}
function Profile({
  profile,
  joined,
  onSave,
  onLogOut,
}: {
  profile: StudentProfile;
  joined: Competition[];
  onSave: (profile: StudentProfile) => void;
  onLogOut: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const { points: totalPoints, completed: totalCompleted } = calculateProfileTotals(joined);
  return (
    <div className="student-page">
      <PageIntro title="Profile" />
      <section className="profile-summary">
        <div className="profile-avatar">
          {profile.firstName[0]}
          {profile.lastName[0]}
        </div>
        <div>
          <h2>
            {profile.firstName} {profile.lastName}
          </h2>
          <p>{profile.email}</p>
          <p>{profile.college}</p>
        </div>
        <button onClick={() => setEditing(true)}>Edit profile</button>
      </section>
      <div className="profile-stats student-profile-stats">
        <article>
          <Icon name="trophy" />
          <strong>{joined.length}</strong>
          <span>Joined</span>
        </article>
        <article>
          <Icon name="spark" />
          <strong>{totalPoints}</strong>
          <span>Points</span>
        </article>
        <article>
          <Icon name="target" />
          <strong>{totalCompleted}</strong>
          <span>Completed</span>
        </article>
      </div>
      <button className="student-log-out" onClick={onLogOut}>
        Log out
      </button>
      {editing && (
        <div className="modal-backdrop">
          <section className="profile-edit-modal">
            <button className="modal-close" onClick={() => setEditing(false)}>
              <Icon name="close" />
            </button>
            <h2>Edit profile</h2>
            <label>
              First name
              <input
                value={draft.firstName}
                onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
              />
            </label>
            <label>
              Last name
              <input
                value={draft.lastName}
                onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
              />
            </label>
            <label>
              Email
              <input
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              />
            </label>
            <label>
              College
              <select
                value={draft.college}
                onChange={(event) => setDraft({ ...draft, college: event.target.value })}
              >
                {buSchools.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
            >
              Save profile
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function PageIntro({ title }: { title: string }) {
  return (
    <header className="page-intro">
      <h1>{title}</h1>
    </header>
  );
}
function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}
