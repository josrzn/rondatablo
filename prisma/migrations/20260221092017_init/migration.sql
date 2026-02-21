-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "parsedClaim" TEXT NOT NULL,
    "parsedTensions" TEXT NOT NULL,
    "parsedQuestions" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "panelistIds" TEXT NOT NULL,
    "guestPrompt" TEXT NOT NULL,
    "seriousness" REAL NOT NULL,
    "humor" REAL NOT NULL,
    "confrontation" REAL NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "speakerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Event_episodeId_createdAt_idx" ON "Event"("episodeId", "createdAt");
