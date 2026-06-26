use serde::{Deserialize, Serialize};

/// Static catalog of earnable badges — code-defined achievements, not a DB
/// table, since the *rules* for earning one live in handler logic anyway
/// (e.g. "hosted a 32+ player tournament"). The DB only records *who*
/// earned *which* key (`user_badges`).
pub struct BadgeDef {
    pub key: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub icon: &'static str,
}

pub const BADGE_CATALOG: &[BadgeDef] = &[
    BadgeDef {
        key: "host_beginner",
        label: "Host-Anfänger",
        description: "Ein Event mit mindestens 32 Teilnehmern gehostet",
        icon: "🎤",
    },
    BadgeDef {
        key: "host_pro",
        label: "Host-Profi",
        description: "Ein Event mit mindestens 64 Teilnehmern gehostet",
        icon: "🎪",
    },
    BadgeDef {
        key: "tournament_winner_first",
        label: "Turnier-Anfänger",
        description: "Das erste Turnier gewonnen",
        icon: "🏆",
    },
    BadgeDef {
        key: "tournament_champion",
        label: "Serien-Champion",
        description: "5 Turniere gewonnen",
        icon: "🏅",
    },
    BadgeDef {
        key: "first_publish",
        label: "Erster Release",
        description: "Das erste eigene Spiel im Store veröffentlicht",
        icon: "🎮",
    },
    BadgeDef {
        key: "first_review",
        label: "Erster Eindruck",
        description: "Die erste Bewertung abgegeben",
        icon: "📝",
    },
    BadgeDef {
        key: "social_butterfly",
        label: "Gut vernetzt",
        description: "10 Freunde hinzugefügt",
        icon: "🤝",
    },
];

pub fn find_badge(key: &str) -> Option<&'static BadgeDef> {
    BADGE_CATALOG.iter().find(|b| b.key == key)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Badge {
    pub key: String,
    pub label: String,
    pub description: String,
    pub icon: String,
    pub earned_at: String,
}

impl Badge {
    pub fn from_key(key: &str, earned_at: String) -> Option<Badge> {
        find_badge(key).map(|def| Badge {
            key: def.key.to_string(),
            label: def.label.to_string(),
            description: def.description.to_string(),
            icon: def.icon.to_string(),
            earned_at,
        })
    }
}
