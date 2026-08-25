import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unplaced = searchParams.get('unplaced');
    const ownerId = searchParams.get('ownerId');
    
    let whereClause: any = {};
    if (unplaced === 'true') {
      whereClause.isPlaced = false;
    }
    if (ownerId) {
      whereClause.ownerId = ownerId;
    }

    const nfts = await prisma.nFT.findMany({
      where: whereClause,
      include: {
        owner: {
          select: {
            name: true,
            id: true,
          }
        }
      }
    });
    return NextResponse.json(nfts);
  } catch (error: any) {
    console.error("GET NFT Error:", error.message);
    return NextResponse.json({ error: "Failed to fetch NFTs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelType } = await req.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const nft = await prisma.nFT.create({
      data: {
        modelType,
        ownerId: user.id,
      }
    });

    return NextResponse.json(nft);
  } catch (error: any) {
    console.error("POST NFT Error:", error.message);
    return NextResponse.json({ error: "Failed to claim NFT" }, { status: 500 });
  }
}
