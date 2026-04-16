import { amazonRenderer } from "./AmazonRenderer";
import { gistRenderer } from "./GistRenderer";
import { contentRendererRegistry } from "./registry";
import { tikTokRenderer } from "./TikTokRenderer";
import { xRenderer } from "./XRenderer";
import { youTubeRenderer } from "./YouTubeRenderer";

contentRendererRegistry.register(youTubeRenderer);
contentRendererRegistry.register(xRenderer);
contentRendererRegistry.register(amazonRenderer);
contentRendererRegistry.register(tikTokRenderer);
contentRendererRegistry.register(gistRenderer);

export { contentRendererRegistry };
export * from "./types";
