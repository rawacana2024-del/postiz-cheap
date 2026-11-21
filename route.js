// GET /api/cron/posts — external cron trigger for due scheduled posts.
//
// The app has no built-in scheduler: due posts are normally triggered when
// a logged-in user opens GET /api/posts (which requires a session, so an
// external cron cannot call it). This route runs the same trigger + polling
// logic for ALL users, authenticated by a shared secret instead of a session:
//
//   Authorization: Bearer <CRON_SECRET>
//
// Call it every 5 minutes from an external scheduler (GitHub Actions,
// cron-job.org, QStash, ...). Vercel Hobby has no built-in cron, so an
// external caller is required.
//
// Security: the secret is compared in constant time. A missing or wrong
// secret returns 401. If CRON_SECRET is not configured at all the route
// returns 500 — set it in the deployment's environment variables.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { UserService } from "@/lib/services/user";
import config from "@/lib/config";

export const dynamic = "force-dynamic";

// Helper function to call the MuAPI publishing endpoints.
// Mirrors src/app/api/posts/route.js (kept in sync with it).
async function triggerMuApiPublish(platform, payload) {
  const apiKey = config.ai.apiKey;
  const plat = (platform || "").toLowerCase().replace("x_twitter", "x");

  const endpointMap = {
    youtube: "https://api.muapi.ai/api/v1/youtube-publish",
    tiktok: "https://api.muapi.ai/api/v1/tiktok-publish",
    instagram: "https://api.muapi.ai/api/v1/instagram-publish",
    x: "https://api.muapi.ai/api/v1/x-publish",
    facebook: "https://api.muapi.ai/api/v1/facebook-publish",
    linkedin: "https://api.muapi.ai/api/v1/linkedin-publish",
    threads: "https://api.muapi.ai/api/v1/threads-publish",
    pinterest: "https://api.muapi.ai/api/v1/pinterest-publish",
  };

  const endpoint = endpointMap[plat] || endpointMap.youtube;

  const captionText = [
    payload.title,
    payload.description,
    payload.tags ? payload.tags.split(",").map(t => t.trim().startsWith("#") ? t.trim() : `#${t.trim()}`).join(" ") : ""
  ].filter(Boolean).join("\n\n");

  const bodyData = {
    account_id: parseInt(payload.accountId),
    media_url: payload.mediaUrl
  };

  if (plat === "youtube") {
    bodyData.title = payload.title || "Untitled Video";
    bodyData.description = payload.description || "";
    bodyData.tags = payload.tags ? payload.tags.split(",").map(t => t.trim()) : [];
    bodyData.privacy = payload.privacy || "public";
    if (payload.categoryId) bodyData.category_id = payload.categoryId;
    bodyData.made_for_kids = payload.madeForKids || false;
  } else if (plat === "tiktok") {
    bodyData.title = payload.title || captionText;
    bodyData.privacy_level = payload.privacy || "PUBLIC_TO_EVERYONE";
    bodyData.disable_comment = payload.disableComment || false;
    bodyData.disable_duet = payload.disableDuet || false;
    bodyData.disable_stitch = payload.disableStitch || false;
  } else if (plat === "instagram") {
    bodyData.caption = captionText;
    bodyData.placement = "reels";
    bodyData.share_to_feed = true;
  } else if (plat === "x") {
    bodyData.caption = captionText.substring(0, 280);
    bodyData.reply_settings = "everyone";
  } else if (plat === "facebook") {
    bodyData.caption = captionText;
    bodyData.placement = "timeline";
  } else if (plat === "linkedin") {
    bodyData.caption = captionText;
  } else if (plat === "threads") {
    bodyData.caption = captionText.substring(0, 500);
    bodyData.placement = "timeline";
  } else if (plat === "pinterest") {
    bodyData.title = payload.title || "Untitled Pin";
    bodyData.caption = payload.description || captionText;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify(bodyData)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`MuAPI submission failed: ${errText}`);
  }

  const data = await res.json();
  return data.request_id || data.id; // Returns request_id
}

function isAuthorized(req) {
  const secret = config.cron.secret;
  if (!secret) return { ok: false, reason: "not-configured" };

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false, reason: "missing" };

  // Constant-time comparison; length must match first.
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return { ok: false, reason: "mismatch" };
  return { ok: timingSafeEqual(a, b), reason: "mismatch" };
}

export async function GET(req) {
  const auth = isAuthorized(req);
  if (!auth.ok) {
    if (auth.reason === "not-configured") {
      console.error("[CRON_POSTS] CRON_SECRET is not configured");
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
    }
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const summary = { triggered: 0, completed: 0, failed: 0, polled: 0, errors: [] };

  try {
    // 1. Fetch due scheduled posts (all users) + processing posts.
    const duePosts = await prisma.scheduledPost.findMany({
      where: { status: "scheduled", scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
    });
    const processingPosts = await prisma.scheduledPost.findMany({
      where: { status: "processing", requestId: { not: null } },
      orderBy: { scheduledAt: "asc" },
    });

    // Pre-fetch connected MuAPI accounts if any due post has a dummy/missing accountId.
    let devAccounts = null;
    if (duePosts.some(p => !p.accountId || p.accountId === 101) && config.ai.apiKey) {
      try {
        const accRes = await fetch("https://muapi.ai/api/social/accounts", {
          headers: { "x-api-key": config.ai.apiKey }
        });
        if (accRes.ok) devAccounts = await accRes.json();
      } catch (_) {}
    }

    // 2. Trigger due scheduled posts.
    for (const post of duePosts) {
      try {
        await UserService.deductCredits(post.userId, config.ai.generationCost);

        let targetAccountId = post.accountId;
        if ((!targetAccountId || targetAccountId === 101) && devAccounts) {
          const normPlat = (post.platform || "").toLowerCase().replace("x_twitter", "x").replace("twitter", "x");
          const matched = devAccounts.find(a => (a.platform_name || "").toLowerCase() === normPlat);
          if (matched) targetAccountId = matched.id;
        }

        const requestId = await triggerMuApiPublish(post.platform, {
          accountId: targetAccountId,
          mediaUrl: post.mediaUrl,
          title: post.title,
          description: post.description,
          tags: post.tags,
          privacy: post.privacy,
          disableComment: post.disableComment,
          disableDuet: post.disableDuet,
          disableStitch: post.disableStitch,
          categoryId: post.categoryId,
          madeForKids: post.madeForKids
        });

        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: { accountId: targetAccountId, status: "processing", requestId }
        });
        summary.triggered += 1;
      } catch (err) {
        console.error(`[CRON_POSTS] Failed to trigger due post ${post.id}:`, err);
        summary.errors.push({ postId: post.id, step: "trigger", error: err.message });
        try {
          await prisma.scheduledPost.update({
            where: { id: post.id },
            data: { status: "failed", error: err.message || "Failed to trigger scheduled post" }
          });
        } catch (_) {}
        summary.failed += 1;
      }
    }

    // 3. Poll processing posts.
    for (const post of processingPosts) {
      try {
        const apiKey = config.ai.apiKey;
        const res = await fetch(`https://api.muapi.ai/api/v1/predictions/${post.requestId}/result`, {
          headers: { "x-api-key": apiKey }
        });

        if (res.ok) {
          const result = await res.json();
          const status = result.status || result.state;
          summary.polled += 1;

          if (status === "completed" || status === "succeeded") {
            const output = result.output || (Array.isArray(result.outputs) ? result.outputs[0] : null) || {};
            const publishedUrl = output.url || output.x_url || output.instagram_url || output.facebook_url || output.linkedin_url || output.threads_url || output.pinterest_url || (output.publish_id ? `https://${post.platform}.com/post/${output.publish_id}` : null);

            await prisma.scheduledPost.update({
              where: { id: post.id },
              data: {
                status: "completed",
                publishedUrl: publishedUrl || "Published successfully",
                publishResult: JSON.stringify(output),
                publishedAt: new Date()
              }
            });
            summary.completed += 1;
          } else if (status === "failed") {
            const errorMsg = result.error || "Publishing failed";
            await prisma.scheduledPost.update({
              where: { id: post.id },
              data: { status: "failed", error: errorMsg }
            });
            // Refund credits
            try {
              await UserService.addCredits(post.userId, config.ai.generationCost);
            } catch (_) {}
            summary.failed += 1;
          }
        }
      } catch (err) {
        console.error(`[CRON_POSTS] Failed to poll status for post ${post.id}:`, err);
        summary.errors.push({ postId: post.id, step: "poll", error: err.message });
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[CRON_POSTS_ERROR]", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
