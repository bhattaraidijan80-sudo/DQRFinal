import { createClient } from '@supabase/supabase-js';

const RAW_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://wmaklxnxmtvfshjzubic.supabase.co';

export const SUPABASE_URL = RAW_SUPABASE_URL.replace(/\/rest\/v1\/?$/i, '').replace(
  /\/+$/,
  ''
);

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_ezxXFoFZJCEzh0ELJaaZnA_4Vy850UH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Compresses an uploaded image file on an offscreen canvas so it stays lightweight
 * for both Supabase Storage and localStorage fallback.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 1100,
  quality = 0.84
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Invalid image.'));
      };
      img.onload = () => {
        const scale = Math.min(1, maxWidth / Math.max(1, img.width));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an image file to the `dqr-media` Supabase Storage bucket if available,
 * and seamlessly falls back to a compressed Data URL if the bucket hasn't been created yet.
 */
export async function uploadDqrMedia(
  file: File,
  folder: string
): Promise<string> {
  const compressedDataUrl = await compressImageFile(file);

  try {
    const res = await fetch(compressedDataUrl);
    const blob = await res.blob();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folder}/${Date.now()}_${safeName}`;

    const { error } = await supabase.storage
      .from('dqr-media')
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (!error) {
      const { data } = supabase.storage.from('dqr-media').getPublicUrl(path);
      if (data?.publicUrl) return data.publicUrl;
    }
  } catch {
    // Graceful fallback to compressed data URL
  }

  return compressedDataUrl;
}

export async function loadAllStoreFromSupabase(): Promise<
  Record<string, unknown>
> {
  try {
    const { data, error } = await supabase
      .from('dqr_app_store')
      .select('store_key, payload');

    if (error || !data) return {};
    const out: Record<string, unknown> = {};
    for (const row of data) {
      if (row && typeof row.store_key === 'string') {
        out[row.store_key] = row.payload;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function loadStoreFromSupabase<T>(
  storeKey: string
): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('dqr_app_store')
      .select('payload')
      .eq('store_key', storeKey)
      .maybeSingle();

    if (error || !data) return null;
    return data.payload as T;
  } catch {
    return null;
  }
}

export async function saveStoreToSupabase<T>(
  storeKey: string,
  payload: T
): Promise<boolean> {
  try {
    const { error } = await supabase.from('dqr_app_store').upsert(
      {
        store_key: storeKey,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'store_key' }
    );
    return !error;
  } catch {
    return false;
  }
}

export interface SyncUserRowInput {
  id: string;
  username: string;
  pin: string;
  fullName: string;
  role: 'admin' | 'member';
  createdAt: string;
  photoUrl: string | null;
  bio: string;
  favouriteTopic: string;
  isOnline: boolean;
  lastLoggedIn: string;
  xp: number;
  level: number;
  rankId: string;
  streak: number;
  tagline: string;
  announcement: string;
  announcementChecked: boolean;
  ownedTitleIds: string[];
  equippedTitleId: string | null;
  achievementIds: string[];
  equippedAchievementIds: string[];
  reportCard: unknown;
}

export async function syncUsersToSupabaseTable(
  users: SyncUserRowInput[]
): Promise<boolean> {
  try {
    if (users.length === 0) return true;
    const rows = users.map((u) => ({
      id: u.id,
      username: u.username,
      pin: u.pin,
      full_name: u.fullName,
      role: u.role,
      created_at: u.createdAt,
      photo_url: u.photoUrl,
      bio: u.bio,
      favourite_topic: u.favouriteTopic,
      is_online: u.isOnline,
      last_logged_in: u.lastLoggedIn,
      xp: u.xp,
      level: u.level,
      rank_id: u.rankId,
      streak: u.streak,
      tagline: u.tagline,
      announcement: u.announcement,
      announcement_checked: u.announcementChecked,
      owned_title_ids: u.ownedTitleIds,
      equipped_title_id: u.equippedTitleId,
      achievement_ids: u.achievementIds,
      equipped_achievement_ids: u.equippedAchievementIds,
      report_card: u.reportCard,
    }));

    const { error } = await supabase
      .from('dqr_users')
      .upsert(rows, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteUserFromSupabaseTable(
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('dqr_users')
      .delete()
      .eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}

export async function syncQuizzesToSupabaseTable(
  quizzes: {
    id: string;
    quizName: string;
    yearBS: string;
    position: string;
    host: string;
    players: string[];
    teamCount: number;
    rating: number;
    extraNote: string;
    photos: string[];
    createdAt: number;
  }[]
): Promise<boolean> {
  try {
    if (quizzes.length === 0) return true;
    const rows = quizzes.map((q) => ({
      id: q.id,
      quiz_name: q.quizName,
      year_bs: q.yearBS,
      position: q.position,
      host: q.host,
      players: q.players,
      team_count: q.teamCount,
      rating: q.rating,
      extra_note: q.extraNote,
      photos: q.photos,
      created_at: q.createdAt,
    }));
    const { error } = await supabase
      .from('dqr_quizzes')
      .upsert(rows, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteQuizFromSupabaseTable(
  quizId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('dqr_quizzes')
      .delete()
      .eq('id', quizId);
    return !error;
  } catch {
    return false;
  }
}

export async function syncTerritoriesToSupabaseTable(
  territories: {
    id: string;
    code: string;
    name: string;
    description: string;
    durationMinutes: number;
    currentHolderUserId: string | null;
    currentHolderName: string | null;
    highestScore: number;
    wonOn: string | null;
    questions: unknown[];
    history: unknown[];
    attemptedUserIds: string[];
  }[]
): Promise<boolean> {
  try {
    if (territories.length === 0) return true;
    const rows = territories.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      duration_minutes: t.durationMinutes,
      current_holder_user_id: t.currentHolderUserId,
      current_holder_name: t.currentHolderName,
      highest_score: t.highestScore,
      won_on: t.wonOn,
      questions: t.questions,
      history: t.history,
      attempted_user_ids: t.attemptedUserIds,
    }));
    const { error } = await supabase
      .from('dqr_territories')
      .upsert(rows, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function syncSystemMessagesToSupabaseTable(
  messages: {
    id: string;
    userId: string;
    sender: 'system' | 'user';
    text: string;
    createdAt: number;
    readByAdmin: boolean;
    readByUser: boolean;
  }[]
): Promise<boolean> {
  try {
    if (messages.length === 0) return true;
    const rows = messages.map((m) => ({
      id: m.id,
      user_id: m.userId,
      sender: m.sender,
      text: m.text,
      created_at: m.createdAt,
      read_by_admin: m.readByAdmin,
      read_by_user: m.readByUser,
    }));
    const { error } = await supabase
      .from('dqr_system_messages')
      .upsert(rows, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}


