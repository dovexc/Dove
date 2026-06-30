use resend_rs::types::CreateEmailBaseOptions;
use resend_rs::Resend;

use crate::state::AppState;

/// Best-effort email send — mirrors `create_notification`'s philosophy in
/// `handlers.rs`: a missed email shouldn't roll back or fail the request
/// that triggered it. With no `RESEND_API_KEY` configured this just logs,
/// so the server runs fine without a Resend account (e.g. local dev).
pub async fn send_email(state: &AppState, to: &str, subject: &str, html: String) {
    let Some(api_key) = &state.resend_api_key else {
        tracing::info!("E-Mail (kein RESEND_API_KEY): an {to}: {subject}");
        return;
    };

    let resend = Resend::new(api_key);
    let to_addrs = [to];
    let email = CreateEmailBaseOptions::new(state.email_from.as_str(), to_addrs, subject)
        .with_html(&html);

    if let Err(e) = resend.emails.send(email).await {
        tracing::error!("E-Mail an {to} konnte nicht verschickt werden: {e}");
    }
}

/// Anything other than `"en"` (including unset/garbage values) falls back
/// to German — same default as the frontend's `i18nStore`.
fn is_en(lang: &str) -> bool {
    lang == "en"
}

fn layout(title: &str, body_html: &str) -> String {
    format!(
        "<div style=\"font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a\">\
         <h2 style=\"color:#1d4ed8\">{title}</h2>{body_html}\
         <p style=\"margin-top:32px;font-size:12px;color:#888\">Dove · dovexc.com</p></div>"
    )
}

/// Returns `(subject, html)` — every template function follows this shape
/// so callers don't need a separate subject lookup per language.
pub fn welcome_email(lang: &str, display_name: &str) -> (String, String) {
    if is_en(lang) {
        (
            "Welcome to Dove".to_string(),
            layout(
                "Welcome to Dove!",
                &format!(
                    "<p>Hi {display_name},</p>\
                     <p>your Dove account has been created. Have fun browsing the store!</p>"
                ),
            ),
        )
    } else {
        (
            "Willkommen bei Dove".to_string(),
            layout(
                "Willkommen bei Dove!",
                &format!(
                    "<p>Hi {display_name},</p>\
                     <p>dein Dove-Account wurde erfolgreich erstellt. Viel Spaß beim Stöbern im Store!</p>"
                ),
            ),
        )
    }
}

pub fn purchase_confirmation_email(
    lang: &str,
    display_name: &str,
    game_title: &str,
    amount_cents: i64,
) -> (String, String) {
    if is_en(lang) {
        let amount = format!("{:.2}", amount_cents as f64 / 100.0);
        (
            "Purchase confirmation".to_string(),
            layout(
                "Purchase confirmation",
                &format!(
                    "<p>Hi {display_name},</p>\
                     <p>thanks for purchasing <strong>{game_title}</strong> for {amount} €.</p>\
                     <p>You'll find it in your library right away.</p>"
                ),
            ),
        )
    } else {
        let amount = format!("{:.2}", amount_cents as f64 / 100.0).replace('.', ",");
        (
            "Kaufbestätigung".to_string(),
            layout(
                "Kaufbestätigung",
                &format!(
                    "<p>Hi {display_name},</p>\
                     <p>danke für deinen Kauf von <strong>{game_title}</strong> für {amount} €.</p>\
                     <p>Du findest es ab sofort in deiner Bibliothek.</p>"
                ),
            ),
        )
    }
}

pub fn wishlist_sale_email(
    lang: &str,
    display_name: &str,
    game_title: &str,
    sale_price_cents: i64,
) -> (String, String) {
    if is_en(lang) {
        let price = format!("{:.2}", sale_price_cents as f64 / 100.0);
        (
            "A game on your wishlist is on sale!".to_string(),
            layout(
                "A game on your wishlist is on sale!",
                &format!(
                    "<p>Hi {display_name},</p>\
                     <p><strong>{game_title}</strong> from your wishlist is now available for {price} €.</p>"
                ),
            ),
        )
    } else {
        let price = format!("{:.2}", sale_price_cents as f64 / 100.0).replace('.', ",");
        (
            "Ein Spiel auf deiner Wunschliste ist im Angebot!".to_string(),
            layout(
                "Ein Spiel auf deiner Wunschliste ist im Angebot!",
                &format!(
                    "<p>Hi {display_name},</p>\
                     <p><strong>{game_title}</strong> von deiner Wunschliste ist jetzt für {price} € erhältlich.</p>"
                ),
            ),
        )
    }
}

pub fn ban_notification_email(lang: &str, display_name: &str, unban_url: &str) -> (String, String) {
    if is_en(lang) {
        (
            "Your Dove account has been suspended".to_string(),
            layout(
                "Your Dove account has been suspended",
                &format!(
                    "<p>Hi {display_name},</p>\
                     <p>your account has been suspended for violating our policies.</p>\
                     <p>If you believe this was a mistake, you can submit an appeal here:</p>\
                     <p><a href=\"{unban_url}\" style=\"color:#1d4ed8\">{unban_url}</a></p>"
                ),
            ),
        )
    } else {
        (
            "Dein Dove-Account wurde gesperrt".to_string(),
            layout(
                "Dein Dove-Account wurde gesperrt",
                &format!(
                    "<p>Hi {display_name},</p>\
                     <p>dein Account wurde wegen eines Verstoßes gegen unsere Richtlinien gesperrt.</p>\
                     <p>Wenn du glaubst, dass das ein Fehler war, kannst du hier einen \
                     Entbannungsantrag stellen:</p>\
                     <p><a href=\"{unban_url}\" style=\"color:#1d4ed8\">{unban_url}</a></p>"
                ),
            ),
        )
    }
}
