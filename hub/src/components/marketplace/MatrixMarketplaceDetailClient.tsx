"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  GitBranch,
  Grid3X3,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FollowButton } from "@/components/social/FollowButton";
import { UserBadges } from "@/components/social/UserBadges";
import {
  humanize,
  MatrixBlueprint,
  nodeLabel,
  type Listing,
} from "./MatrixMarketplaceClient";
import styles from "./MatrixMarketplace.module.css";

function detailParts(row: Record<string, unknown>) {
  const values = [
    row.category,
    row.recency,
    row.book,
    Array.isArray(row.books) && row.books.length
      ? row.books.map(humanize).join(", ")
      : null,
    row.direction,
    row.tolerance !== null && row.tolerance !== undefined
      ? `Tolerance ${row.tolerance}`
      : null,
  ];

  return values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(humanize);
}

export function MatrixMarketplaceDetailClient({
  listing,
  currentUserId,
}: {
  listing: Listing;
  currentUserId: string;
}) {
  const [importing, setImporting] = useState(false);
  const [added, setAdded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows =
    listing.matrix_type === "pipeline"
      ? listing.snapshot.pipeline_steps
      : listing.snapshot.factors;
  const authorName =
    listing.author?.display_name || listing.author?.username || "SlipSurge member";

  async function addMatrix() {
    if (importing || added) return;
    setImporting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/matrix-marketplace/${listing.id}/import`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not add this Matrix.");
      setAdded(true);
      window.dispatchEvent(new CustomEvent("ss:matrices-updated"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add this Matrix.",
      );
    } finally {
      setImporting(false);
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(listing.snapshot.element_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className={`${styles.page} ${styles.detailPage}`}>
      <Link href="/marketplace" className={styles.backLink}>
        <ArrowLeft size={15} /> Matrix Marketplace
      </Link>

      <section
        className={styles.detailHero}
        style={{ "--matrix-color": listing.color } as React.CSSProperties}
      >
        <div className={styles.detailEyebrow}>
          {listing.matrix_type === "pipeline" ? (
            <GitBranch size={14} />
          ) : (
            <Grid3X3 size={14} />
          )}
          {listing.matrix_type === "pipeline"
            ? "Community Pipeline"
            : "Community Matrix"}
        </div>
        <div className={styles.detailHeading}>
          <div>
            <h1>{listing.title}</h1>
            <p>
              Review the complete public setup before adding it to your own
              Matrices.
            </p>
          </div>
          <span className={styles.ultimatePill}>
            <Sparkles size={13} /> Ultimate
          </span>
        </div>
      </section>

      <div className={styles.detailLayout}>
        <div className={styles.detailMain}>
          <section className={styles.detailPanel}>
            <div className={styles.detailPanelHeading}>
              <div>
                <span>Matrix preview</span>
                <h2>Complete blueprint</h2>
              </div>
              <code>{listing.snapshot.element_code}</code>
            </div>
            <MatrixBlueprint snapshot={listing.snapshot} />
          </section>

          <section className={styles.detailPanel}>
            <div className={styles.detailPanelHeading}>
              <div>
                <span>About this Matrix</span>
                <h2>Creator notes</h2>
              </div>
            </div>
            <p className={styles.fullDescription}>
              {listing.description ||
                "The creator did not add a description for this Matrix."}
            </p>
            {listing.tags.length > 0 && (
              <div className={styles.tags}>
                {listing.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
          </section>

          <section className={styles.detailPanel}>
            <div className={styles.detailPanelHeading}>
              <div>
                <span>Public configuration</span>
                <h2>
                  {rows.length} {listing.matrix_type === "pipeline" ? "steps" : "Elements"}
                </h2>
              </div>
            </div>
            <div className={styles.configurationList}>
              {rows.map((row, index) => {
                const parts = detailParts(row);
                return (
                  <article key={index}>
                    <i>{String(index + 1).padStart(2, "0")}</i>
                    <div>
                      <strong>{nodeLabel(row)}</strong>
                      {parts.length > 0 && <p>{parts.join(" / ")}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className={styles.detailAside}>
          <section className={styles.creatorPanel}>
            <span className={styles.asideLabel}>Shared by</span>
            <div className={styles.detailAuthor}>
              <Link
                href={`/profile/${listing.author?.username}`}
                className={styles.detailAvatar}
              >
                {listing.author?.avatar_url ? (
                  <img src={listing.author.avatar_url} alt="" />
                ) : (
                  authorName[0]
                )}
              </Link>
              <div>
                <span>
                  <Link href={`/profile/${listing.author?.username}`}>
                    {authorName}
                  </Link>
                  <UserBadges
                    userId={listing.author_id}
                    badges={listing.author_badges}
                    size={16}
                    maxVisible={3}
                  />
                </span>
                <small>
                  @{listing.author?.username} · {listing.author?.follower_count ?? 0} followers
                </small>
              </div>
            </div>
            {!listing.is_owner && currentUserId && (
              <FollowButton
                currentUserId={currentUserId}
                targetUserId={listing.author_id}
                initialFollowing={listing.is_following}
              />
            )}
            <Link
              href={`/marketplace?author=${listing.author_id}`}
              className={styles.moreCreatorLink}
            >
              More from @{listing.author?.username} <ChevronRight size={14} />
            </Link>
          </section>

          <section className={styles.matrixFacts}>
            <span className={styles.asideLabel}>Listing details</span>
            <div>
              <ArrowDownToLine size={15} />
              <span>
                <small>Community adds</small>
                <strong>{listing.copy_count}</strong>
              </span>
            </div>
            <div>
              <CalendarDays size={15} />
              <span>
                <small>Published</small>
                <strong>
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(listing.published_at))}
                </strong>
              </span>
            </div>
            <div>
              <ShieldCheck size={15} />
              <span>
                <small>Access</small>
                <strong>Ultimate members</strong>
              </span>
            </div>
          </section>

          <section className={styles.detailActions}>
            <button onClick={addMatrix} disabled={importing || added}>
              {added ? (
                <>
                  <Check size={16} /> Added to my Matrices
                </>
              ) : (
                <>
                  <Plus size={16} />
                  {importing ? "Adding..." : "Add to my Matrices"}
                </>
              )}
            </button>
            <button className={styles.detailCopyButton} onClick={copyCode}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Code copied" : "Copy Element Code"}
            </button>
            {error && <p role="alert">{error}</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}
