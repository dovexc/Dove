use crate::badges::Badge;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub background_url: Option<String>,
    pub bio: Option<String>,
    pub created_at: String,
    pub is_profile_hidden: bool,
    pub is_admin: bool,
    pub equipped_badge: Option<Badge>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PublicProfile {
    pub id: i64,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub background_url: Option<String>,
    pub bio: Option<String>,
    pub created_at: String,
    pub screenshots: Vec<ProfileScreenshot>,
    pub wishlist: Vec<CatalogGame>,
    pub equipped_badge: Option<Badge>,
}

#[derive(Debug, Deserialize)]
pub struct SetBadgeRequest {
    pub badge_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileScreenshot {
    pub id: i64,
    pub user_id: i64,
    pub image_url: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub is_profile_hidden: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct ImageUpload {
    pub image: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteAccountRequest {
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CatalogGame {
    pub id: i64,
    pub publisher_user_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub price_cents: i64,
    pub created_at: String,
    pub file_url: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub version: String,
    pub tags: Option<String>,
    pub status: String,
    pub min_specs: Option<String>,
    pub recommended_specs: Option<String>,
    pub save_path_hint: Option<String>,
    pub avg_rating: Option<f64>,
    pub review_count: i64,
}

/// Ledger entry for a game purchase. Today `purchase_game` creates and
/// settles one of these atomically (no real payment exists yet), but the
/// pending/paid/failed lifecycle is already in place so a future Stripe
/// integration only needs to: create the order as `pending`, redirect to
/// Stripe Checkout, and flip it to `paid`/`failed` from a webhook instead
/// of granting the ownership row directly.
#[derive(Debug, Serialize, Clone)]
pub struct Order {
    pub id: i64,
    pub user_id: i64,
    pub catalog_game_id: i64,
    pub catalog_game_title: String,
    pub amount_cents: i64,
    pub status: String,
    pub stripe_payment_intent_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// What a tournament participant is owed once a knockout event concludes.
/// No payment provider exists yet (same caveat as `Order`), so this is a
/// manual-payout ledger for the host today and the structure a future
/// automated payout (e.g. Stripe Connect transfers) would settle against.
#[derive(Debug, Serialize, Clone)]
pub struct TournamentPayout {
    pub id: i64,
    pub event_id: i64,
    pub event_title: String,
    pub user_id: i64,
    pub placement: i64,
    pub amount_cents: i64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewCatalogGame {
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub tags: Option<String>,
    pub min_specs: Option<String>,
    pub recommended_specs: Option<String>,
    pub save_path_hint: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CloudSave {
    pub catalog_game_id: i64,
    pub size_bytes: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct GameVersionNote {
    pub id: i64,
    pub catalog_game_id: i64,
    pub version: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewGameVersionNote {
    pub version: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct GameEvent {
    pub id: i64,
    pub host_user_id: i64,
    pub host_display_name: String,
    pub title: String,
    pub description: Option<String>,
    pub catalog_game_id: Option<i64>,
    pub catalog_game_title: Option<String>,
    pub custom_game_title: Option<String>,
    pub registration_deadline: Option<String>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub prize_cents: i64,
    pub prize_mode: String,
    pub prize_second_cents: i64,
    pub prize_third_cents: i64,
    pub team_size: i64,
    pub max_entries: Option<i64>,
    pub format: String,
    pub is_private: bool,
    /// Only populated when the requesting user is the host — see
    /// `CASE WHEN host_user_id = ?1` in `EVENT_COLUMNS`. Everyone else gets
    /// `null` so the code can't be read back off a public event payload.
    pub join_code: Option<String>,
    pub created_at: String,
    pub participant_count: i64,
    pub joined: bool,
}

#[derive(Debug, Deserialize)]
pub struct NewGameEvent {
    pub title: String,
    pub description: Option<String>,
    pub catalog_game_id: Option<i64>,
    pub custom_game_title: Option<String>,
    pub registration_deadline: Option<String>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub prize_cents: i64,
    pub prize_mode: String,
    #[serde(default)]
    pub prize_second_cents: i64,
    #[serde(default)]
    pub prize_third_cents: i64,
    #[serde(default = "default_team_size")]
    pub team_size: i64,
    #[serde(default)]
    pub max_entries: Option<i64>,
    #[serde(default = "default_event_format")]
    pub format: String,
    #[serde(default)]
    pub is_private: bool,
}

#[derive(Debug, Deserialize, Default)]
pub struct JoinWithCode {
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct JoinByCodeRequest {
    pub code: String,
}

fn default_team_size() -> i64 {
    1
}

fn default_event_format() -> String {
    "knockout".to_string()
}

#[derive(Debug, Serialize, Clone)]
pub struct EventTeam {
    pub id: i64,
    pub event_id: i64,
    pub name: String,
    pub created_by: i64,
    pub member_count: i64,
    pub members: Vec<UserSummary>,
}

#[derive(Debug, Deserialize)]
pub struct NewEventTeam {
    pub name: String,
    #[serde(default)]
    pub code: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct EventMatch {
    pub id: i64,
    pub round: i64,
    pub slot: i64,
    pub entry_a_id: Option<i64>,
    pub entry_b_id: Option<i64>,
    pub winner_entry_id: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct BracketEntry {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct EventBracket {
    pub entries: Vec<BracketEntry>,
    pub matches: Vec<EventMatch>,
}

#[derive(Debug, Deserialize)]
pub struct SetMatchWinner {
    pub winner_entry_id: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GameScreenshot {
    pub id: i64,
    pub catalog_game_id: i64,
    pub image_url: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct GameReview {
    pub id: i64,
    pub catalog_game_id: i64,
    pub user_id: i64,
    pub reviewer_display_name: String,
    pub rating: f64,
    pub body: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewGameReview {
    pub rating: f64,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ManifestFile {
    pub relative_path: String,
    pub sha256: String,
    pub size_bytes: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct GameManifest {
    pub version: String,
    /// Base URL to prepend to each file's `relative_path` to download it
    /// (R2 public URL, trailing slash included).
    pub file_url: String,
    pub files: Vec<ManifestFile>,
}

#[derive(Debug, Serialize, Clone)]
pub struct StorageUsage {
    pub used_bytes: i64,
    pub quota_bytes: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct UserSummary {
    pub id: i64,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub online: bool,
    pub playing_title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetPlayingRequest {
    pub catalog_game_id: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct FriendRequests {
    pub incoming: Vec<UserSummary>,
    pub outgoing: Vec<UserSummary>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Notification {
    pub id: i64,
    pub kind: String,
    pub message: String,
    pub event_id: Option<i64>,
    pub actor_user_id: Option<i64>,
    pub is_read: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DirectMessage {
    pub id: i64,
    pub sender_id: i64,
    pub sender_display_name: String,
    pub recipient_id: i64,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewDirectMessage {
    pub body: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct EventMessage {
    pub id: i64,
    pub event_id: i64,
    pub sender_id: i64,
    pub sender_display_name: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewEventMessage {
    pub body: String,
}
