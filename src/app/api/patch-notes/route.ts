import { NextResponse } from "next/server";
import { FALLBACK_PATCH_NOTES } from "@/features/home/patchNotesFallback";

export const revalidate = 86400; // Cache for 24 hours

interface NexonNewsItem {
  id: number;
  name: string;
  category: string;
  liveDate: string;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildNewsUrl(item: NexonNewsItem): string {
  const slug = item.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `https://www.nexon.com/maplestory/news/${item.category}/${item.id}/${slug}`;
}

export async function GET() {
  try {
    // Nexon serves all news as static JSON on their CDN (the website is an SPA).
    const response = await fetch("https://g.nexonstatic.com/maplestory/cms/v1/news", {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`CDN returned ${response.status}`);

    const items = (await response.json()) as NexonNewsItem[];

    // Sort by liveDate descending, take latest 15
    const sorted = items
      .toSorted((a, b) => new Date(b.liveDate).getTime() - new Date(a.liveDate).getTime())
      .slice(0, 15);

    const patchNotes = sorted.map((item) => {
      const versionMatch = item.name.match(/V\.?(\d+)/i);
      const version = versionMatch ? `v${versionMatch[1]}` : "";

      return {
        version,
        title: item.name.toUpperCase(),
        date: formatDate(item.liveDate),
        url: buildNewsUrl(item),
        tags: [item.category.toUpperCase()],
      };
    });

    return NextResponse.json(patchNotes);
  } catch (error) {
    console.error("Error fetching patch notes:", error);
    return NextResponse.json(FALLBACK_PATCH_NOTES);
  }
}
