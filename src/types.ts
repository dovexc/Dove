export interface Game {
  id: number;
  name: string;
  exe_path: string;
  cover_path: string | null;
  description: string | null;
  total_playtime_seconds: number;
  created_at: string;
  size_on_disk_bytes: number;
  last_played_at: string | null;
  is_running: boolean;
}

export interface NewGame {
  name: string;
  exe_path: string;
  cover_path: string | null;
  description: string | null;
  size_on_disk_bytes?: number | null;
  steam_install_dir?: string | null;
}

export interface UpdateGame {
  name: string;
  exe_path: string;
  cover_path: string | null;
  description: string | null;
  size_on_disk_bytes?: number | null;
}

export interface SteamGame {
  appid: string;
  name: string;
  install_dir: string;
  cover_path: string | null;
  description: string | null;
  size_on_disk_bytes: number;
}

export interface StoreUser {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

export interface CatalogGame {
  id: number;
  publisher_user_id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  price_cents: number;
  created_at: string;
}

export interface NewCatalogGame {
  title: string;
  description: string | null;
  cover_url: string | null;
}
