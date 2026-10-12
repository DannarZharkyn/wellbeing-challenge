export type Dimension =
  | 'Environmental'
  | 'Social'
  | 'Emotional'
  | 'Financial'
  | 'Intellectual'
  | 'Spiritual'
  | 'Physical';

export type Competition = {
  id: string;
  name: string;
  type: 'Group' | 'Individual';
  description: string;
  date: string;
  members: number;
  progress: number;
  accent: string;
  joined: boolean;
  teams?: string[];
};

export const dimensionMeta: Record<Dimension, { color: string; soft: string; icon: string }> = {
  Environmental: { color: '#37806d', soft: '#e4f1eb', icon: 'leaf' },
  Social: { color: '#426fa2', soft: '#e7eef7', icon: 'people' },
  Emotional: { color: '#a05f78', soft: '#f6e9ee', icon: 'heart' },
  Financial: { color: '#9a742e', soft: '#f6efdc', icon: 'wallet' },
  Intellectual: { color: '#6658a4', soft: '#eeeafa', icon: 'book' },
  Spiritual: { color: '#667a55', soft: '#edf2e8', icon: 'spark' },
  Physical: { color: '#b55745', soft: '#faeae5', icon: 'move' },
};

export const activities = [
  { id: 1, title: 'Take a mindful campus walk', detail: 'Notice three things in nature along your route.', dimension: 'Environmental' as Dimension, duration: 10, points: 50 },
  { id: 2, title: 'Choose a reusable bottle', detail: 'Refill instead of reaching for a single-use bottle.', dimension: 'Environmental' as Dimension, duration: 5, points: 30 },
  { id: 3, title: 'Check in with a friend', detail: 'Send a thoughtful message and really listen.', dimension: 'Social' as Dimension, duration: 10, points: 40 },
  { id: 4, title: 'Share a meal', detail: 'Invite someone to eat with you without screens.', dimension: 'Social' as Dimension, duration: 30, points: 80 },
  { id: 5, title: 'Name how you feel', detail: 'Pause, identify the feeling, and write one sentence.', dimension: 'Emotional' as Dimension, duration: 5, points: 35 },
  { id: 6, title: 'Three good things', detail: 'Record three moments that went well today.', dimension: 'Emotional' as Dimension, duration: 5, points: 35 },
  { id: 7, title: 'Plan a weekly budget', detail: 'Set a realistic spending goal for the next seven days.', dimension: 'Financial' as Dimension, duration: 15, points: 60 },
  { id: 8, title: 'Review one subscription', detail: 'Check whether one recurring expense still serves you.', dimension: 'Financial' as Dimension, duration: 10, points: 45 },
  { id: 9, title: 'Learn something new', detail: 'Read or watch something beyond your coursework.', dimension: 'Intellectual' as Dimension, duration: 15, points: 55 },
  { id: 10, title: 'Visit office hours', detail: 'Bring one question and start a conversation.', dimension: 'Intellectual' as Dimension, duration: 20, points: 75 },
  { id: 11, title: 'Quiet reflection', detail: 'Make space to reconnect with what matters to you.', dimension: 'Spiritual' as Dimension, duration: 10, points: 45 },
  { id: 12, title: 'Practice gratitude', detail: 'Thank someone who made a difference this week.', dimension: 'Spiritual' as Dimension, duration: 5, points: 35 },
  { id: 13, title: 'Move for ten minutes', detail: 'Walk, stretch, dance, or move in a way you enjoy.', dimension: 'Physical' as Dimension, duration: 10, points: 50 },
  { id: 14, title: 'Take a hydration break', detail: 'Refill your water and step away from your screen.', dimension: 'Physical' as Dimension, duration: 5, points: 30 },
];

export const competitions: Competition[] = [
  { id: 'fall', name: 'Fall Well-Being Challenge', type: 'Individual', description: 'Build small habits across all seven dimensions.', date: 'Oct 1 – Nov 15', members: 1248, progress: 62, accent: '#a6192e', joined: true },
  { id: 'eng', name: 'Engineering Floor Cup', type: 'Group', description: 'Earn points with your floor and climb the team table.', date: 'Oct 7 – Oct 28', members: 186, progress: 41, accent: '#2f6f62', joined: true, teams: ['Kilachand 4', 'Myles 3', 'Warren A8', 'Danielsen 2'] },
  { id: 'reset', name: 'Midterm Reset Week', type: 'Individual', description: 'A focused week of rest, connection, and movement.', date: 'Oct 20 – Oct 27', members: 537, progress: 0, accent: '#6658a4', joined: false },
];

export const teamLeaderboard = [
  { name: 'Kilachand 4', detail: '58 members', points: 12840 },
  { name: 'Myles 3', detail: '46 members', points: 11620 },
  { name: 'Warren A8', detail: '51 members', points: 10980 },
  { name: 'Danielsen 2', detail: '31 members', points: 9240 },
];

export const studentLeaderboard = [
  { name: 'Maya R.', detail: 'College of Arts & Sciences', points: 1380 },
  { name: 'Jordan L.', detail: 'Questrom School of Business', points: 1290 },
  { name: 'Dannar Z.', detail: 'College of Engineering', points: 1170 },
  { name: 'Alex T.', detail: 'College of Communication', points: 1040 },
  { name: 'Sam K.', detail: 'Sargent College', points: 980 },
];

export const adminCompetitions = [
  { name: 'Fall Well-Being Challenge', type: 'Individual', status: 'Active', participants: 1248, activities: 18, dates: 'Oct 1 – Nov 15' },
  { name: 'Engineering Floor Cup', type: 'Group', status: 'Active', participants: 186, activities: 12, dates: 'Oct 7 – Oct 28' },
  { name: 'Midterm Reset Week', type: 'Individual', status: 'Scheduled', participants: 537, activities: 8, dates: 'Oct 20 – Oct 27' },
  { name: 'Law Sections Challenge', type: 'Group', status: 'Draft', participants: 0, activities: 10, dates: 'Nov 3 – Nov 21' },
];
