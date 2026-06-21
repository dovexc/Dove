export interface Game {
  id: number;
  name: string;
  exe_path: string;
  cover_path: string | null;
  description: string | null;
  total_playtime_seconds: number;
  created_at: string;
  is_running: boolean;
}

export interface NewGame {
  name: string;
  exe_path: string;
  cover_path: string | null;
  description: string | null;
}
