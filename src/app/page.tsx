import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default async function Dashboard() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="auth-container">
      <div className="auth-card" style={{ maxWidth: '500px', textAlign: 'center' }}>
        <h1 className="auth-title" style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>
          Welcome, {session.user?.name || "Explorer"}
        </h1>
        
        <p style={{ color: '#94a3b8', marginBottom: '2.5rem', fontSize: '1.1rem' }}>
          {session.user?.email}
        </p>

        <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(34, 211, 238, 0.2)', marginBottom: '2rem' }}>
          <h3 style={{ color: '#22d3ee', letterSpacing: '2px', marginBottom: '1rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Ready for your session?
          </h3>
          <p style={{ color: 'rgba(226, 232, 240, 0.8)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
            Enter the immersive environment to interact with niches, explore the family tree, and teleport through the spaceship.
          </p>
          <Link href="/scene" style={{ display: 'block', width: '100%', textDecoration: 'none' }}>
            <button className="auth-button" style={{ margin: 0, boxShadow: '0 0 15px rgba(34, 211, 238, 0.2)' }}>
              START AR
            </button>
          </Link>
        </div>

        <LogoutButton />
      </div>
    </main>
  );
}
