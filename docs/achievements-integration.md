# Achievements — game integration guide

Dove achievements work like Steam's: you define them once as the publisher,
and your game reports unlocks at runtime with a single HTTP call. There is
no SDK to install and nothing to compile against — any language that can
make an HTTP POST works.

## 1. Define your achievements

Before a unlock call can succeed, the achievement has to exist. On your
game's store page in the Dove launcher (visible to you as the publisher),
open the **Achievements** section and add each one:

- **Key** — a short, stable, all-caps identifier you choose (e.g.
  `FIRST_WIN`, `COLLECT_100_COINS`). This is what your game sends at
  runtime — pick it once and don't rename it later, or existing unlocks for
  the old key become orphaned.
- **Title** / **Description** — shown to players.
- **Icon** (optional) — shown next to the title.
- **Hidden** — if checked, the title/description/icon are withheld from
  players who haven't unlocked it yet (shown as "???"), the same way Steam
  handles spoiler achievements. This is enforced server-side, not just
  hidden in the UI.

## 2. How your game reports an unlock

When the Dove launcher starts your game, it sets two environment variables
in the game's process:

| Variable | Meaning |
|---|---|
| `DOVE_ACHIEVEMENT_URL` | Local URL to POST unlocks to, e.g. `http://127.0.0.1:53214/unlock` — the port is chosen automatically at launcher startup and **changes between launcher runs**, so always read it from the environment, never hardcode it. |
| `DOVE_ACHIEVEMENT_TOKEN` | A random, short-lived token identifying this specific play session. Not a login credential — it only proves "this process was launched by the Dove launcher for this game, for this play session" and stops working once the game exits. |

To unlock an achievement, `POST` to `DOVE_ACHIEVEMENT_URL` with:

```json
{
  "token": "<value of DOVE_ACHIEVEMENT_TOKEN>",
  "key": "FIRST_WIN"
}
```

That's the entire contract. No response body to parse — check the HTTP
status:

| Status | Meaning |
|---|---|
| `204` | Unlocked (or already was — safe to call more than once for the same achievement). |
| `400` | Malformed request body. |
| `401` | Token unknown/expired — most likely the game wasn't launched by the Dove launcher (e.g. you're testing the .exe directly), or the launcher already exited. |
| `404` | No achievement with that `key` exists for this game — check step 1. |
| `502` | Dove's backend was unreachable when the launcher tried to forward the unlock. |

## 3. Important notes

- **Only works when launched directly by the Dove launcher.** Games
  started via a Steam shortcut or as a `.app` bundle through the launcher
  don't currently get these environment variables — that launch path
  doesn't support passing them yet. If your game is only reachable that
  way, achievements aren't available for it yet.
- **The env vars aren't present at all outside the launcher** (e.g. running
  the executable directly during development). Guard your integration code
  so a missing `DOVE_ACHIEVEMENT_URL` just skips the unlock call instead of
  crashing.
- **Unlocking is idempotent** — calling it again for an achievement the
  player already has is a harmless no-op (still `204`), so you don't need
  to track unlock state yourself before calling.
- **Fire-and-forget is fine.** A failed call (network hiccup, launcher not
  running) just means the achievement doesn't unlock this time — there's no
  queue or retry built in, so if you want resilience, retry on your own
  timer rather than blocking gameplay on it.
- **The token is per play session**, not per player — a new one is issued
  every time the launcher starts your game, and it stops working once the
  game process exits. Don't persist it or reuse it across sessions.

## 4. Code examples

### curl (for testing)

```sh
curl -X POST "$DOVE_ACHIEVEMENT_URL" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$DOVE_ACHIEVEMENT_TOKEN\",\"key\":\"FIRST_WIN\"}"
```

### C / C++ (via libcurl)

```c
#include <curl/curl.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

void dove_unlock_achievement(const char *key) {
    const char *url = getenv("DOVE_ACHIEVEMENT_URL");
    const char *token = getenv("DOVE_ACHIEVEMENT_TOKEN");
    if (!url || !token) return; // not running under the Dove launcher

    char body[512];
    snprintf(body, sizeof(body), "{\"token\":\"%s\",\"key\":\"%s\"}", token, key);

    CURL *curl = curl_easy_init();
    if (!curl) return;
    struct curl_slist *headers = curl_slist_append(NULL, "Content-Type: application/json");
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body);
    curl_easy_perform(curl); // fire-and-forget; ignore the result
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
}
```

### Unity (C#)

```csharp
using System;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

public static class DoveAchievements
{
    public static void Unlock(string key)
    {
        string url = Environment.GetEnvironmentVariable("DOVE_ACHIEVEMENT_URL");
        string token = Environment.GetEnvironmentVariable("DOVE_ACHIEVEMENT_TOKEN");
        if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(token)) return; // not under the Dove launcher

        string json = $"{{\"token\":\"{token}\",\"key\":\"{key}\"}}";
        var request = new UnityWebRequest(url, "POST");
        byte[] body = Encoding.UTF8.GetBytes(json);
        request.uploadHandler = new UploadHandlerRaw(body);
        request.SetRequestHeader("Content-Type", "application/json");
        request.SendWebRequest(); // fire-and-forget; no need to await the result
    }
}
```

Usage: `DoveAchievements.Unlock("FIRST_WIN");`

### Godot (GDScript)

```gdscript
func dove_unlock_achievement(key: String) -> void:
    var url = OS.get_environment("DOVE_ACHIEVEMENT_URL")
    var token = OS.get_environment("DOVE_ACHIEVEMENT_TOKEN")
    if url == "" or token == "":
        return # not running under the Dove launcher

    var http = HTTPRequest.new()
    add_child(http)
    var body = JSON.stringify({"token": token, "key": key})
    http.request(url, ["Content-Type: application/json"], HTTPClient.METHOD_POST, body)
```
