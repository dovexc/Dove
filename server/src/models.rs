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
    /// Spendable in-app balance — used to pay for store purchases (see
    /// `purchase_game`). No real payment provider is wired up yet, so
    /// top-ups (`top_up_wallet`) are simulated rather than charging a card;
    /// this is the same "no real provider yet" situation as `Order`, except
    /// here the balance is actually spendable today instead of just a
    /// future-Stripe placeholder.
    pub wallet_balance_cents: i64,
    pub is_banned: bool,
    /// "de" or "en" — which language to send this user's transactional
    /// emails in. Mirrors the frontend's `i18nStore`, synced via
    /// `PATCH /api/me/language`.
    pub language: String,
}

/// Minimal user info embedded in a `UserReport` for display in moderation —
/// deliberately not the full `User` struct (no need for wallet/admin/etc.).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportedUserSummary {
    pub id: i64,
    pub display_name: String,
    pub email: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserReport {
    pub id: i64,
    pub reason: String,
    pub created_at: String,
    pub reporter: ReportedUserSummary,
    pub reported: ReportedUserSummary,
    pub images: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnbanRequest {
    pub id: i64,
    pub message: Option<String>,
    pub created_at: String,
    pub user: ReportedUserSummary,
}

#[derive(Debug, Deserialize)]
pub struct NewUserReport {
    pub reason: String,
    /// Evidence screenshots as `data:image/...;base64,...` URLs, same
    /// convention as `ImageUpload` — capped at `MAX_REPORT_IMAGES` in the
    /// handler.
    #[serde(default)]
    pub images: Vec<String>,
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
    /// Whatever the frontend's language switch was set to at signup —
    /// optional/loosely validated since it only affects email wording, not
    /// app behavior.
    #[serde(default)]
    pub language: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetLanguageRequest {
    pub language: String,
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
    /// Only populated when an offer is currently active (`sale_ends_at` is
    /// still in the future) — computed in SQL, so callers never need to
    /// check expiry themselves. An expired offer just reads as `None` here
    /// without any cleanup job.
    pub sale_price_cents: Option<i64>,
    pub sale_ends_at: Option<String>,
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

/// Full-replace edit payload — the publisher's edit dialog always sends the
/// complete current state, so this isn't a partial patch (no need for the
/// `Option<Option<T>>` dance that would otherwise be required to
/// distinguish "leave unchanged" from "clear this field").
/// `sale_price_cents`/`sale_ends_at` both `None` clears any active offer.
#[derive(Debug, Deserialize)]
pub struct UpdateCatalogGame {
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub tags: Option<String>,
    pub min_specs: Option<String>,
    pub recommended_specs: Option<String>,
    pub save_path_hint: Option<String>,
    pub price_cents: i64,
    pub sale_price_cents: Option<i64>,
    pub sale_ends_at: Option<String>,
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
    pub helpful_count: i64,
    pub unhelpful_count: i64,
    /// The caller's own vote on this review, if any — `None` both when
    /// they haven't voted and when the request is unauthenticated.
    pub my_vote: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct NewGameReview {
    pub rating: f64,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReviewVoteRequest {
    pub is_helpful: bool,
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

#[derive(Debug, Serialize, Clone)]
pub struct WalletTopup {
    pub id: i64,
    pub user_id: i64,
    pub amount_cents: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewWalletTopup {
    pub amount_cents: i64,
}

/// One row of the publisher's "Basis Analytics" view — everything needed
/// for both the per-game table and the overview totals (the frontend sums
/// this array rather than the server computing a separate overview, since
/// it's the same handful of numbers either way).
#[derive(Debug, Serialize, Clone)]
pub struct PublisherGameStats {
    pub catalog_game_id: i64,
    pub title: String,
    pub status: String,
    pub price_cents: i64,
    pub units_sold: i64,
    pub revenue_cents: i64,
    pub wishlist_count: i64,
    pub view_count: i64,
    pub avg_rating: Option<f64>,
    pub review_count: i64,
    pub avg_playtime_seconds: Option<f64>,
    pub installs_count: i64,
    pub uninstalls_count: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DailyStat {
    pub date: String,
    pub units_sold: i64,
    pub revenue_cents: i64,
}

/// Always has exactly 5 entries (stars 1..=5, `count: 0` where there are no
/// reviews at that rating) so the frontend can render all five bars without
/// special-casing missing buckets.
#[derive(Debug, Serialize, Clone)]
pub struct RatingBucket {
    pub stars: i64,
    pub count: i64,
}

/// Where this game ranks by units sold among all approved games sharing a
/// given tag — one entry per tag the game has.
#[derive(Debug, Serialize, Clone)]
pub struct TagRanking {
    pub tag: String,
    pub rank: i64,
    pub total: i64,
}

/// One entry per distinct `game_views.source` value recorded for the game.
#[derive(Debug, Serialize, Clone)]
pub struct SourceCount {
    pub source: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct PublisherGameStatsDetail {
    pub stats: PublisherGameStats,
    pub daily: Vec<DailyStat>,
    pub rating_distribution: Vec<RatingBucket>,
    pub tag_rankings: Vec<TagRanking>,
    pub views_by_source: Vec<SourceCount>,
}
