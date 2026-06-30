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
  catalog_game_id: number | null;
  installed_version: string | null;
}

export interface UpdateAvailable {
  installed_version: string | null;
  latest_version: string;
  files_to_update: number;
  bytes_to_download: number;
}

export interface NewGame {
  name: string;
  exe_path: string;
  cover_path: string | null;
  description: string | null;
  size_on_disk_bytes?: number | null;
  steam_install_dir?: string | null;
  catalog_game_id?: number | null;
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

export interface Badge {
  key: string;
  label: string;
  description: string;
  icon: string;
  earned_at: string;
}

export interface StoreUser {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  background_url: string | null;
  bio: string | null;
  created_at: string;
  is_profile_hidden: boolean;
  is_admin: boolean;
  equipped_badge: Badge | null;
  wallet_balance_cents: number;
}

export interface WalletTopup {
  id: number;
  user_id: number;
  amount_cents: number;
  created_at: string;
}

export interface ProfileScreenshot {
  id: number;
  user_id: number;
  image_url: string;
  created_at: string;
}

export interface PublicProfile {
  id: number;
  display_name: string;
  avatar_url: string | null;
  background_url: string | null;
  bio: string | null;
  created_at: string;
  screenshots: ProfileScreenshot[];
  wishlist: CatalogGame[];
  equipped_badge: Badge | null;
}

export interface UserSummary {
  id: number;
  display_name: string;
  avatar_url: string | null;
  online: boolean;
  playing_title: string | null;
}

export interface FriendRequests {
  incoming: UserSummary[];
  outgoing: UserSummary[];
}

export interface Notification {
  id: number;
  kind: string;
  message: string;
  event_id: number | null;
  actor_user_id: number | null;
  is_read: boolean;
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
  file_url: string | null;
  file_size_bytes: number | null;
  version: string;
  tags: string | null;
  status: "pending" | "approved" | "rejected";
  min_specs: string | null;
  recommended_specs: string | null;
  save_path_hint: string | null;
  avg_rating: number | null;
  review_count: number;
  sale_price_cents: number | null;
  sale_ends_at: string | null;
}

export interface UpdateCatalogGame {
  title: string;
  description: string | null;
  cover_url: string | null;
  tags: string | null;
  min_specs: string | null;
  recommended_specs: string | null;
  save_path_hint: string | null;
  price_cents: number;
  sale_price_cents: number | null;
  sale_ends_at: string | null;
}

export interface PublisherGameStats {
  catalog_game_id: number;
  title: string;
  status: "pending" | "approved" | "rejected";
  price_cents: number;
  units_sold: number;
  revenue_cents: number;
  wishlist_count: number;
  view_count: number;
  avg_rating: number | null;
  review_count: number;
}

export interface DailyStat {
  date: string;
  units_sold: number;
  revenue_cents: number;
}

export interface RatingBucket {
  stars: number;
  count: number;
}

export interface TagRanking {
  tag: string;
  rank: number;
  total: number;
}

export interface PublisherGameStatsDetail {
  stats: PublisherGameStats;
  daily: DailyStat[];
  rating_distribution: RatingBucket[];
  tag_rankings: TagRanking[];
}

export interface NewCatalogGame {
  title: string;
  description: string | null;
  cover_url: string | null;
  tags: string | null;
  min_specs: string | null;
  recommended_specs: string | null;
  save_path_hint: string | null;
}

export interface GameScreenshot {
  id: number;
  catalog_game_id: number;
  image_url: string;
  created_at: string;
}

export interface GameReview {
  id: number;
  catalog_game_id: number;
  user_id: number;
  reviewer_display_name: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export interface GameVersionNote {
  id: number;
  catalog_game_id: number;
  version: string;
  notes: string | null;
  created_at: string;
}

export interface GameEvent {
  id: number;
  host_user_id: number;
  host_display_name: string;
  title: string;
  description: string | null;
  catalog_game_id: number | null;
  catalog_game_title: string | null;
  custom_game_title: string | null;
  registration_deadline: string | null;
  starts_at: string | null;
  ends_at: string | null;
  prize_cents: number;
  prize_mode: "winner_takes_all" | "split";
  prize_second_cents: number;
  prize_third_cents: number;
  team_size: number;
  max_entries: number | null;
  format: "knockout" | "all";
  is_private: boolean;
  join_code: string | null;
  created_at: string;
  participant_count: number;
  joined: boolean;
}

export interface NewGameEvent {
  title: string;
  description: string | null;
  catalog_game_id: number | null;
  custom_game_title: string | null;
  registration_deadline: string | null;
  starts_at: string | null;
  ends_at: string | null;
  prize_cents: number;
  prize_mode: "winner_takes_all" | "split";
  prize_second_cents: number;
  prize_third_cents: number;
  team_size: number;
  max_entries: number | null;
  format: "knockout" | "all";
  is_private: boolean;
}

export interface EventTeam {
  id: number;
  event_id: number;
  name: string;
  created_by: number;
  member_count: number;
  members: UserSummary[];
}

export interface BracketEntry {
  id: number;
  name: string;
}

export interface EventMatch {
  id: number;
  round: number;
  slot: number;
  entry_a_id: number | null;
  entry_b_id: number | null;
  winner_entry_id: number | null;
}

export interface EventBracket {
  entries: BracketEntry[];
  matches: EventMatch[];
}

export interface StorageUsage {
  used_bytes: number;
  quota_bytes: number;
}

export interface TournamentPayout {
  id: number;
  event_id: number;
  event_title: string;
  user_id: number;
  placement: 1 | 2;
  amount_cents: number;
  status: "pending" | "paid";
  created_at: string;
}

export interface Order {
  id: number;
  user_id: number;
  catalog_game_id: number;
  catalog_game_title: string;
  amount_cents: number;
  status: "pending" | "paid" | "failed";
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectMessage {
  id: number;
  sender_id: number;
  sender_display_name: string;
  recipient_id: number;
  body: string;
  created_at: string;
}

export interface EventMessage {
  id: number;
  event_id: number;
  sender_id: number;
  sender_display_name: string;
  body: string;
  created_at: string;
}
