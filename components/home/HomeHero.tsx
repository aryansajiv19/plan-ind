"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { Spot } from "@/lib/types";
import { categoryMeta } from "@/lib/categories";
import { signArabic, signLatin } from "@/components/landing/sign-fonts";
import styles from "@/components/landing/SignStreet.module.css";

// Experimental track: the landing as a street of lit shop signs. The deal
// lights nine real places; each round switches two of three off, one beat per
// round, until one sign stays lit. The places are real catalogue rows; the
// rounds are a demonstration, and the caption says so.

// Kufi category words, only where the Arabic is plain and certain; others
// carry the code alone rather than a guessed translation.
const ARABIC: Record<string, string> = {
  dinner: "عشاء", cafe: "مقهى", dessert: "حلويات", shisha: "شيشة", beach: "شاطئ", beach_club: "نادي شاطئ",
  sports: "رياضة", padel: "بادل", games: "ألعاب", movie: "سينما", culture: "ثقافة", karaoke: "كاريوكي",
  nightlife: "سهرة", vibes: "سهرة", family: "عائلة", shopping: "تسوق",
};

// The locked sign palette cycles across the facade; no tints.
const COLOURS = ["red", "yellow", "cobalt", "white", "green", "red", "cobalt", "yellow", "green"] as const;

// Three pools of three (rows). The sign each round keeps, and the winner.
const KEPT = [1, 5, 6];
const WINNER = 5;

function role(index: number): { role: "drop" | "keep" | "win"; row: number } {
  const row = Math.floor(index / 3) + 1;
  if (index === WINNER) return { role: "win", row };
  return { role: KEPT.includes(index) ? "keep" : "drop", row };
}

export default function HomeHero({ greeting, name, fixtures, spots }: { greeting: string; name: string; fixtures: boolean; spots: Spot[] }) {
  const nine = spots.slice(0, 9);

  return (
    <section id="top" className={`${styles.street} ${signLatin.variable} ${signArabic.variable}`} aria-labelledby="home-title">
      <div className={styles.copy}>
        <div className={styles.headSign}>
          <h1 id="home-title" className={styles.title}>
            <span>Nine places.</span>
            <span>Three rounds.</span>
            <span>One night out.</span>
          </h1>
          {/* A real shop sign's bilingual strip: English left, Kufi right. */}
          <p className={styles.headStrip}>
            <span>{greeting}{name ? `, ${name}` : ""} · Deal three · Dubai</span>
            <span className={styles.headArabic} lang="ar" dir="rtl" aria-hidden="true">الليلة</span>
          </p>
        </div>

        <p className={styles.deck}>
          Dinner in DIFC or padel in Al Quoz. Set a budget, and your group picks from nine real places in three quick rounds, no group chat.
        </p>

        <div className={styles.actions}>
          <a href="#plan-lab" className={styles.cta}>Start a plan</a>
          {/* The product without an email: /demo/vote plays a whole sample decision. */}
          <Link href="/demo/vote" className={styles.secondary}>
            {fixtures ? "See a sample vote" : "Watch a sample vote"}
          </Link>
        </div>
      </div>

      {nine.length === 9 && (
        <figure className={styles.facade}>
          <div className={styles.rounds} aria-hidden="true">
            <span data-beat="1">Round 1</span>
            <span data-beat="2">Round 2</span>
            <span data-beat="3">Round 3</span>
            <span data-beat="final">Final</span>
          </div>
          <ul className={styles.wall} aria-label="Nine real places a deal can draw from">
            {nine.map((spot, index) => {
              const { role: r, row } = role(index);
              const arabic = ARABIC[spot.category];
              return (
                <li
                  key={spot.id}
                  className={styles.sign}
                  data-colour={COLOURS[index]}
                  data-role={r}
                  data-row={row}
                  style={{ "--i": index } as CSSProperties}
                >
                  <span className={styles.signTop}>
                    <span className={styles.code}>{categoryMeta(spot.category).code}</span>
                    {arabic && <span className={styles.arabic} lang="ar" dir="rtl">{arabic}</span>}
                  </span>
                  <span className={styles.name}>{spot.name}</span>
                  <span className={styles.strip}>{spot.area}{spot.min_spend > 0 ? ` · from AED ${spot.min_spend}` : ""}</span>
                </li>
              );
            })}
          </ul>
          <figcaption className={styles.caption}>A sample deal, played on real places from tonight’s catalogue.</figcaption>
        </figure>
      )}
    </section>
  );
}
