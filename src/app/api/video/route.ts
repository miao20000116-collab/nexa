import { NextRequest, NextResponse } from "next/server";
import {
  getVideoProject,
  updateMaterialStrategy,
  planStoryboard,
  saveStoryboard,
  buildTimelineFromStoryboard,
  setAspectRatio,
  attachMusicTrack,
  regenerateScene,
  requestAiFill,
  requestSynthesizeVoice,
  requestRender,
  deleteScene,
  updatePlayhead,
} from "@/modules/video/services/video-project-service";
import {
  saveUserMusic,
  searchLicensedMusicStub,
} from "@/modules/video/music/music-service";
import type {
  AspectRatio,
  MaterialStrategyMode,
  Storyboard,
} from "@/modules/video/types";
import { UI } from "@/lib/ui-copy";
import { toUserErrorMessage } from "@/lib/user-errors";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "???? ID" }, { status: 400 });
  }
  const loaded = await getVideoProject(projectId);
  if (!loaded) {
    return NextResponse.json({ error: "?????" }, { status: 404 });
  }
  return NextResponse.json(loaded);
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const projectId = String(form.get("projectId") ?? "");
      const file = form.get("file");
      if (!projectId || !(file instanceof File)) {
        return NextResponse.json({ error: "?????" }, { status: 400 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const uploaded = await saveUserMusic({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
        title: file.name,
      });
      const attached = await attachMusicTrack(projectId, uploaded.track);
      return NextResponse.json({
        ...attached,
        analysis: uploaded.analysis,
        warning: uploaded.warning,
      });
    }

    const body = await request.json();
    const projectId = String(body.projectId ?? "");
    const action = String(body.action ?? "");
    if (!projectId || !action) {
      return NextResponse.json({ error: "?????" }, { status: 400 });
    }

    switch (action) {
      case "material_strategy": {
        const result = await updateMaterialStrategy(projectId, {
          mode: (body.mode ?? "prefer_owned") as MaterialStrategyMode,
          targetDurationSec: Number(body.targetDurationSec ?? 30),
          assets: body.assets,
        });
        return NextResponse.json(result);
      }
      case "plan_storyboard": {
        const result = await planStoryboard(
          projectId,
          Number(body.targetDurationSec ?? 30)
        );
        return NextResponse.json(result);
      }
      case "save_storyboard": {
        const result = await saveStoryboard(
          projectId,
          body.storyboard as Storyboard
        );
        return NextResponse.json(result);
      }
      case "build_timeline": {
        const result = await buildTimelineFromStoryboard(
          projectId,
          (body.aspectRatio ?? "9:16") as AspectRatio
        );
        return NextResponse.json(result);
      }
      case "set_aspect_ratio": {
        const result = await setAspectRatio(
          projectId,
          (body.aspectRatio ?? "9:16") as AspectRatio
        );
        return NextResponse.json(result);
      }
      case "regenerate_scene": {
        const result = await regenerateScene(projectId, String(body.sceneId), {
          confirm: Boolean(body.confirm),
        });
        return NextResponse.json(result, {
          status:
            result.code === "blocked_ai_unavailable"
              ? 503
              : 200,
        });
      }
      case "delete_scene": {
        const result = await deleteScene(projectId, String(body.sceneId));
        return NextResponse.json(result);
      }
      case "ai_fill": {
        const result = await requestAiFill(projectId, {
          confirm: Boolean(body.confirm),
          force: Boolean(body.force),
        });
        return NextResponse.json(result, {
          status: result.code === "blocked_ai_unavailable" ? 503 : 200,
        });
      }
      case "synthesize_voice": {
        const result = await requestSynthesizeVoice(projectId, {
          confirm: Boolean(body.confirm),
        });
        return NextResponse.json(result, {
          status: result.code === "ai_unavailable" ? 503 : 200,
        });
      }
      case "generate_music": {
        try {
          const { AIGateway } = await import(
            "@/modules/ai/gateway/ai-gateway"
          );
          if (!AIGateway.isAvailable("generateMusic")) {
            return NextResponse.json(
              {
                message: UI.common.aiUnavailable,
                code: "blocked_ai_unavailable",
              },
              { status: 503 }
            );
          }
          const result = await AIGateway.generateMusic({
            prompt: String(body.prompt ?? "?????????"),
            durationSec: Number(body.durationSec ?? 30),
          });
          if (result.url) {
            const attached = await attachMusicTrack(projectId, {
              id: `ai_music_${Date.now()}`,
              title: "AI ????",
              sourceKind: "ai_generated",
              url: result.url,
              license: {
                commercialUse: false,
                note: "AI ?????????????",
              },
              scenes: [],
            });
            return NextResponse.json({
              ...attached,
              message: "??????????????????????",
              code: "ok",
            });
          }
          return NextResponse.json(
            { message: "?????????", code: "ai_error" },
            { status: 502 }
          );
        } catch (err) {
          const { CapabilityNotConfiguredError } = await import(
            "@/modules/ai/gateway/ai-gateway"
          );
          if (err instanceof CapabilityNotConfiguredError) {
            return NextResponse.json(
              {
                message: UI.common.aiUnavailable,
                code: "blocked_ai_unavailable",
              },
              { status: 503 }
            );
          }
          return NextResponse.json(
            {
              message: toUserErrorMessage(err, "????????????"),
              code: "ai_error",
            },
            { status: 502 }
          );
        }
      }
      case "search_licensed_music": {
        return NextResponse.json(searchLicensedMusicStub());
      }
      case "render": {
        const result = await requestRender(projectId, {
          confirm: Boolean(body.confirm),
          allowWithoutMusic: Boolean(body.allowWithoutMusic),
        });
        return NextResponse.json(result);
      }
      case "playhead": {
        const video = await updatePlayhead(
          projectId,
          Number(body.playheadSec ?? 0)
        );
        return NextResponse.json({ video });
      }
      default:
        return NextResponse.json({ error: "??????" }, { status: 400 });
    }
  } catch (err) {
    console.error("[Video API]", err);
    return NextResponse.json(
      { error: toUserErrorMessage(err, "??????????") },
      { status: 500 }
    );
  }
}
