import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const resolvedParams = await params;
    const nftId = resolvedParams.id;
    const existingNft = await prisma.nFT.findUnique({ where: { id: nftId } });
    if (!existingNft) return NextResponse.json({ error: "NFT not found" }, { status: 404 });

    // Check permissions (Owner or Admin)
    if (existingNft.ownerId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden - You do not own this NFT" }, { status: 403 });
    }

    const { x, y, z, isPlaced } = await req.json();

    const updatedNft = await prisma.nFT.update({
      where: { id: nftId },
      data: { x, y, z, isPlaced },
    });

    return NextResponse.json(updatedNft);
  } catch (error: any) {
    console.error("PUT NFT Error:", error.message);
    return NextResponse.json({ error: "Failed to update NFT" }, { status: 500 });
  }
}
