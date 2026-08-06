import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

// Dummy stripe key for MVP
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_dummy", {
  apiVersion: "2026-07-29.dahlia" as any,
});

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { shapeId } = body;

    if (!shapeId) {
      return NextResponse.json({ error: "Shape ID is required" }, { status: 400 });
    }

    // In a real app, we'd verify the Niche exists and is AVAILABLE in Prisma.
    // For MVP, we'll upsert it to ensure it exists.
    const niche = await prisma.niche.findFirst({
      where: { shapeId }
    });

    if (niche && niche.status !== "AVAILABLE") {
      return NextResponse.json({ error: "Niche is already sold or reserved" }, { status: 400 });
    }

    // Since we don't have a real Stripe account hooked up yet for the MVP, 
    // we will simulate a successful payment locally by just updating the DB directly
    // and returning a fake success URL instead of a Stripe checkout session URL.

    if (!process.env.STRIPE_SECRET_KEY) {
      // Simulate successful payment instantly for MVP testing
      let dbNiche = niche;
      if (!dbNiche) {
        dbNiche = await prisma.niche.create({
          data: {
            shapeId,
            status: "SOLD",
            ownerId: (session.user as any).id,
            purchasedAt: new Date(),
          }
        });
      } else {
        dbNiche = await prisma.niche.update({
          where: { id: dbNiche.id },
          data: {
            status: "SOLD",
            ownerId: (session.user as any).id,
            purchasedAt: new Date(),
          }
        });
      }

      return NextResponse.json({ url: "/?success=true&shapeId=" + shapeId });
    }

    // Real Stripe Checkout Code (commented out until keys are added)
    /*
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Niche Shape: ${shapeId}`,
              description: "A combination of 10 niches in the Columbarium.",
            },
            unit_amount: 50000, // $500.00
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/?success=true&shapeId=${shapeId}`,
      cancel_url: `${req.headers.get("origin")}/?canceled=true`,
      metadata: {
        shapeId,
        userId: (session.user as any).id,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
    */
    
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
