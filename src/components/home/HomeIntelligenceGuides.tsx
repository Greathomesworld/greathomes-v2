import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen, Clock, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { PublicEditorialArticleDTO } from '@/src/domain/editorial/entities';

interface HomeIntelligenceGuidesProps {
  articles?: PublicEditorialArticleDTO[];
}

export function HomeIntelligenceGuides({ articles = [] }: HomeIntelligenceGuidesProps) {
  const topics = [
    { title: 'RERA and Approvals', href: '/guides', desc: 'Sanction sanity & promoter compliance' },
    { title: 'Project Comparisons', href: '/guides', desc: 'Side-by-side analysis across micro-markets' },
    { title: 'Carpet vs Super Built-Up', href: '/guides', desc: 'Efficiency calculations that protect value' },
    { title: 'Possession Timelines', href: '/guides', desc: 'Construction milestones & developer delivery records' },
    { title: 'Home-Buying Process', href: '/guides', desc: 'Stamp duty, loan eligibility & registration steps' },
    { title: 'Living in Kolkata', href: '/guides', desc: 'Corridor growth, metro connectivity & community life' },
  ];

  return (
    <section id="intelligence" className="py-24 bg-[#FAFAF8] border-b border-[rgba(17,17,17,0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E85D3F]/30 bg-[#E85D3F]/5 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#E85D3F] font-display mb-3">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Guides & Insights</span>
            </div>
            <h2 className="font-editorial text-3xl sm:text-4xl font-bold tracking-tight text-[#111111]">
              Know Before You Buy.
            </h2>
            <p className="mt-2 font-body text-base text-neutral-600 max-w-2xl">
              Practical guidance and independent property intelligence for making a more informed home-buying decision in Kolkata.
            </p>
          </div>
          <div className="mt-6 md:mt-0">
            <Link
              href="/guides"
              className="inline-flex items-center gap-2 font-display text-sm font-bold text-[#111111] hover:text-[#E85D3F] transition-colors group"
            >
              <span>Explore All Guides</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Featured Editorial Articles Grid */}
        {articles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {articles.slice(0, 3).map((article) => {
              const articleUrl = article.canonicalUrl || `/guides/${article.slug}`;
              return (
                <article
                  key={article.id}
                  className="group bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
                >
                  {article.featuredImage ? (
                    <div className="relative h-48 w-full overflow-hidden bg-neutral-100">
                      <Image
                        src={article.featuredImage}
                        alt={article.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-[#111111] font-display shadow-xs">
                        {article.typeDisplay || 'Guide'}
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-48 w-full bg-gradient-to-br from-neutral-900 to-neutral-800 p-6 flex flex-col justify-between">
                      <div className="absolute top-3 left-3 bg-white/10 backdrop-blur-xs px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white font-display">
                        {article.typeDisplay || 'Guide'}
                      </div>
                      <BookOpen className="h-8 w-8 text-[#E85D3F]/80" />
                    </div>
                  )}

                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-3 text-xs text-neutral-500 font-body mb-2">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {article.readingTimeMinutes || 4} min read
                        </span>
                        <span>•</span>
                        <span>{article.authorName || 'Editorial Team'}</span>
                      </div>

                      <h3 className="font-editorial text-xl font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors line-clamp-2">
                        <Link href={articleUrl}>
                          <span className="absolute inset-0" />
                          {article.title}
                        </Link>
                      </h3>

                      <p className="mt-2 font-body text-xs sm:text-sm text-neutral-600 line-clamp-3">
                        {article.excerpt}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between text-xs font-display font-semibold text-[#E85D3F]">
                      <span>Read Guide</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center mb-16">
            <FileText className="mx-auto h-12 w-12 text-neutral-400 mb-4" />
            <h3 className="font-display text-lg font-bold text-[#111111]">Editorial Guides in Preparation</h3>
            <p className="font-body text-sm text-neutral-600 mt-1 max-w-md mx-auto">
              Our editorial team is currently compiling verified property intelligence and market reports. Check back shortly.
            </p>
          </div>
        )}

        {/* Topic Links Row */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-8 sm:p-10">
          <h4 className="font-display text-xs font-bold uppercase tracking-widest text-neutral-400 mb-6">
            Key Real Estate Topics & Frameworks
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {topics.map((topic) => (
              <Link
                key={topic.title}
                href={topic.href}
                className="group flex items-start gap-3.5 p-3 rounded-xl hover:bg-neutral-50 transition-colors"
              >
                <div className="h-8 w-8 rounded-lg bg-neutral-100 group-hover:bg-[#E85D3F] text-[#111111] group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <CheckCircle2 className="h-4 w-4 text-[#E85D3F] group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h5 className="font-display text-sm font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors">
                    {topic.title}
                  </h5>
                  <p className="font-body text-xs text-neutral-500 mt-0.5">
                    {topic.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
