import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const niches = await prisma.niche.findMany({
      include: { owner: true }
    });

    // Map Prisma Niche models into the format ARScene expects
    const formattedNiches = niches.map((niche: any) => ({
      nicheNum: niche.shapeId,
      status: niche.status.toLowerCase(), // "available", "reserved", "occupied"
      name: niche.owner ? niche.owner.name : "Available",
      message: niche.status === "SOLD" ? "This niche is owned by a loving family." : "This niche is available for purchase.",
      dob: "", // In a real app we'd have a separate deceased person model
      dod: "",
    }));

    // Convert array to record for fast O(1) lookups
    const record: Record<string, any> = {};
    formattedNiches.forEach((n: any) => {
      record[n.nicheNum] = n;
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error fetching niches:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
