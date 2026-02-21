import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEpisodeWithEvents } from "./store";

export async function exportEpisodePack(episodeId: string) {
  const episode = getEpisodeWithEvents(episodeId);

  if (!episode) {
    throw new Error("Episode not found");
  }

  const exportDir = path.join(process.cwd(), "exports", episodeId);
  await mkdir(exportDir, { recursive: true });

  const transcriptLines = episode.events.map((event) => {
    const timestamp = new Date(event.createdAt).toISOString();
    return `[${timestamp}] ${event.speakerId}: ${event.text}`;
  });

  const transcript = `# Transcript\n\n${transcriptLines.join("\n")}\n`;
  const showNotes = [
    "# Show Notes",
    "",
    `- Source: ${episode.sourceValue}`,
    `- Claim: ${episode.parsedClaim}`,
    `- Tensions: ${episode.parsedTensions}`,
    `- Open Questions: ${episode.parsedQuestions}`,
    "",
    "## Major Disagreements",
    "- Speed vs governance capacity",
    "- Productivity gains vs distributional impact",
    "",
    "## Key Predictions",
    "- Panelists made concrete statements during the commitments segment.",
    "",
    "## What To Watch",
    "- Organizational redesign pace",
    "- Labor market transition signals",
    "- Institution response lag"
  ].join("\n");

  const audioManifest = {
    episodeId,
    segments: episode.events.map((event, index) => ({
      idx: index + 1,
      speakerId: event.speakerId,
      text: event.text,
      t: new Date(event.createdAt).toISOString(),
      voiceId: `${event.speakerId}_voice`
    }))
  };

  const episodeMeta = {
    episodeId: episode.id,
    sourceType: episode.sourceType,
    sourceValue: episode.sourceValue,
    cast: {
      moderatorId: episode.moderatorId,
      panelistIds: episode.panelistIds.split(","),
      guestPrompt: episode.guestPrompt
    },
    controls: {
      seriousness: episode.seriousness,
      humor: episode.humor,
      confrontation: episode.confrontation,
      durationMinutes: episode.durationMinutes
    },
    generatedAt: new Date().toISOString()
  };

  await Promise.all([
    writeFile(path.join(exportDir, "transcript.md"), transcript, "utf8"),
    writeFile(path.join(exportDir, "show_notes.md"), showNotes, "utf8"),
    writeFile(
      path.join(exportDir, "audio_manifest.json"),
      JSON.stringify(audioManifest, null, 2),
      "utf8"
    ),
    writeFile(
      path.join(exportDir, "episode_meta.json"),
      JSON.stringify(episodeMeta, null, 2),
      "utf8"
    )
  ]);

  return {
    exportDir,
    files: [
      "transcript.md",
      "show_notes.md",
      "audio_manifest.json",
      "episode_meta.json"
    ]
  };
}
