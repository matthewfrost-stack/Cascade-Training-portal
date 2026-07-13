'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';
import BackButton from '@/app/components/BackButton';
import UniformButton from '@/app/components/UniformButton';

const DESCRIPTORS = [
  'Well tutored', 'Useful', 'Basic', 'Practical', 'Fun',
  'Nothing New', 'Professional', 'Informative', 'Boring', 'Motivating',
  'Too Long', 'Educational', 'Hard to follow', 'Vague', 'Participative',
  'Interactive', 'Disorganised',
];

const POSITIVE_DESCRIPTORS = new Set(['Well tutored', 'Useful', 'Practical', 'Fun', 'Professional', 'Informative', 'Motivating', 'Educational', 'Participative', 'Interactive']);

interface FeedbackRow {
  id: string;
  created_at: string;
  event_id: string | null;
  course_name: string | null;
  event_date: string | null;
  respondent_name: string;
  session_time: string;
  knowledge_before: number;
  knowledge_after: number;
  confidence_before: number;
  confidence_after: number;
  work_role_relevance: number;
  session_descriptors: string[];
  skills_gained: boolean;
  additional_comments: string | null;
  responses?: Record<string, any>;
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-75 mb-1">{label}</p>
      <p className="text-3xl font-black">{value}</p>
      {sub && <p className="text-xs opacity-75 mt-1">{sub}</p>}
    </div>
  );
}

export default function FeedbackResultsPage() {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const [filterCourse, setFilterCourse] = useState('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Role via the shared hook (/api/profile with cookie fallback) instead of a
  // client supabase.auth.getUser(), which returned null when the browser
  // session wasn't attached and wrongly redirected admins to /dashboard.
  const { profile, isAuthenticated, loading: authLoading } = useCurrentUserProfile();
  const initializedRef = useRef(false);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
    const handleTheme = (e: any) => setIsDark(e.detail.isDark);
    window.addEventListener('themeChange', handleTheme);
    return () => window.removeEventListener('themeChange', handleTheme);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.push('/login'); return; }
    const role = profile?.role_tier;
    if (!role) return; // wait for role to resolve (hook retries)
    if (role !== 'admin') { router.push('/dashboard'); return; }
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, profile, router]);

  async function deleteResponse(id: string) {
    setDeletingId(id);
    await supabase.from('course_feedback').delete().eq('id', id);
    setFeedback(prev => prev.filter(f => f.id !== id));
    setExpandedRow(null);
    setConfirmDeleteId(null);
    setDeletingId(null);
  }

  async function fetchFeedback() {
    setLoading(true);
    const { data } = await supabase
      .from('course_feedback')
      .select('*')
      .order('created_at', { ascending: false });
    setFeedback(data || []);
    setLoading(false);
  }

  const courseOptions = useMemo(() => {
    const names = Array.from(new Set(feedback.map(f => f.course_name).filter(Boolean))) as string[];
    return names.sort();
  }, [feedback]);

  const filtered = useMemo(() => {
    if (filterCourse === 'all') return feedback;
    return feedback.filter(f => f.course_name === filterCourse);
  }, [feedback, filterCourse]);

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const knowledgeImprovements = filtered.map(f => {
      const before = f.responses?.knowledge_before ?? f.knowledge_before;
      const after = f.responses?.knowledge_after ?? f.knowledge_after;
      return after - before;
    });
    const confidenceImprovements = filtered.map(f => {
      const before = f.responses?.confidence_before ?? f.confidence_before;
      const after = f.responses?.confidence_after ?? f.confidence_after;
      return after - before;
    });
    const skillsGainedCount = filtered.filter(f => {
      const val = f.responses?.skills_gained ?? f.skills_gained;
      return val === true || val === 'Yes';
    }).length;

    const descriptorCounts: Record<string, number> = {};
    DESCRIPTORS.forEach(d => { descriptorCounts[d] = 0; });
    filtered.forEach(f => {
      const descriptors = f.responses?.descriptors ?? f.session_descriptors ?? [];
      descriptors.forEach((d: string) => {
        if (descriptorCounts[d] !== undefined) descriptorCounts[d]++;
      });
    });

    const sortedDescriptors = Object.entries(descriptorCounts)
      .sort((a, b) => b[1] - a[1])
      .filter(([, count]) => count > 0);

    const maxDescriptorCount = sortedDescriptors[0]?.[1] || 1;

    return {
      total: filtered.length,
      avgKnowledgeBefore: avg(filtered.map(f => f.responses?.knowledge_before ?? f.knowledge_before)),
      avgKnowledgeAfter: avg(filtered.map(f => f.responses?.knowledge_after ?? f.knowledge_after)),
      avgKnowledgeImprovement: avg(knowledgeImprovements),
      avgConfidenceBefore: avg(filtered.map(f => f.responses?.confidence_before ?? f.confidence_before)),
      avgConfidenceAfter: avg(filtered.map(f => f.responses?.confidence_after ?? f.confidence_after)),
      avgConfidenceImprovement: avg(confidenceImprovements),
      avgRelevance: avg(filtered.map(f => f.responses?.relevance ?? f.work_role_relevance)),
      skillsGainedPct: Math.round((skillsGainedCount / filtered.length) * 100),
      sortedDescriptors,
      maxDescriptorCount,
      comments: filtered.filter(f => f.responses?.comments || f.additional_comments),
    };
  }, [filtered]);

  const bg = isDark ? 'bg-gray-950' : 'bg-gray-100';
  const card = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const subtext = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-300 p-4 md:p-8`}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <BackButton to="/admin" />
          <div>
            <h1 className={`text-2xl font-black uppercase tracking-tight ${text}`}>Feedback Results</h1>
            <p className={`text-sm ${subtext}`}>Training course feedback analysis</p>
          </div>
        </div>

        {/* Filter */}
        <div className={`rounded-xl border p-4 mb-6 ${card}`}>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className={`text-xs font-bold uppercase tracking-wide ${subtext} block mb-1`}>Filter by Course</label>
              <select
                value={filterCourse}
                onChange={e => setFilterCourse(e.target.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
              >
                <option value="all">All Courses</option>
                {courseOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <UniformButton onClick={fetchFeedback} className="ml-auto">
              Refresh
            </UniformButton>
          </div>
        </div>

        {loading ? (
          <div className={`text-center py-16 ${subtext}`}>Loading feedback...</div>
        ) : !stats ? (
          <div className={`text-center py-16 rounded-xl border ${card} ${subtext}`}>
            No feedback responses yet.
          </div>
        ) : (
          <div className="space-y-6">

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Responses"
                value={String(stats.total)}
                color="bg-blue-600 text-white"
              />
              <StatCard
                label="Knowledge Gain"
                value={`+${stats.avgKnowledgeImprovement.toFixed(1)}`}
                sub={`${stats.avgKnowledgeBefore.toFixed(1)} → ${stats.avgKnowledgeAfter.toFixed(1)}`}
                color="bg-emerald-600 text-white"
              />
              <StatCard
                label="Confidence Gain"
                value={`+${stats.avgConfidenceImprovement.toFixed(1)}`}
                sub={`${stats.avgConfidenceBefore.toFixed(1)} → ${stats.avgConfidenceAfter.toFixed(1)}`}
                color="bg-purple-600 text-white"
              />
              <StatCard
                label="Skills Gained"
                value={`${stats.skillsGainedPct}%`}
                sub={`Avg relevance: ${stats.avgRelevance.toFixed(1)}/10`}
                color="bg-amber-500 text-white"
              />
            </div>

            {/* Before / After detail */}
            <div className={`rounded-xl border p-5 ${card}`}>
              <h2 className={`text-sm font-black uppercase tracking-wide ${subtext} mb-4`}>Before vs After</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { label: 'Knowledge', before: stats.avgKnowledgeBefore, after: stats.avgKnowledgeAfter },
                  { label: 'Confidence', before: stats.avgConfidenceBefore, after: stats.avgConfidenceAfter },
                ].map(({ label, before, after }) => (
                  <div key={label}>
                    <p className={`text-sm font-bold mb-3 ${text}`}>{label}</p>
                    {[{ name: 'Before', value: before, color: 'bg-gray-400' }, { name: 'After', value: after, color: 'bg-blue-500' }].map(({ name, value, color }) => (
                      <div key={name} className="mb-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className={subtext}>{name}</span>
                          <span className={`font-bold ${text}`}>{value.toFixed(1)}/10</span>
                        </div>
                        <div className={`h-3 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                          <div className={`h-3 rounded-full ${color} transition-all`} style={{ width: `${(value / 10) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Descriptors */}
            {stats.sortedDescriptors.length > 0 && (
              <div className={`rounded-xl border p-5 ${card}`}>
                <h2 className={`text-sm font-black uppercase tracking-wide ${subtext} mb-4`}>How sessions were described</h2>
                <div className="space-y-2">
                  {stats.sortedDescriptors.map(([descriptor, count]) => {
                    const pct = Math.round((count / stats.maxDescriptorCount) * 100);
                    const isPositive = POSITIVE_DESCRIPTORS.has(descriptor);
                    return (
                      <div key={descriptor} className="flex items-center gap-3">
                        <span className={`text-sm font-medium w-36 flex-shrink-0 ${text}`}>{descriptor}</span>
                        <div className={`flex-1 h-5 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                          <div
                            className={`h-5 rounded-full transition-all ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={`text-sm font-bold w-8 text-right ${text}`}>{count}</span>
                      </div>
                    );
                  })}
                </div>
                <p className={`text-xs mt-3 ${subtext}`}>Green = positive descriptor, Red = negative descriptor</p>
              </div>
            )}

            {/* Comments */}
            {stats.comments.length > 0 && (
              <div className={`rounded-xl border p-5 ${card}`}>
                <h2 className={`text-sm font-black uppercase tracking-wide ${subtext} mb-4`}>Additional Comments ({stats.comments.length})</h2>
                <div className="space-y-3">
                  {stats.comments.map(f => (
                    <div key={f.id} className={`rounded-lg p-3 ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-semibold ${text}`}>{f.respondent_name}</span>
                        <span className={`text-xs ${subtext}`}>
                          {f.course_name && `${f.course_name} · `}
                          {f.event_date && new Date(f.event_date + 'T00:00:00').toLocaleDateString('en-GB')}
                        </span>
                      </div>
                      <p className={`text-sm ${subtext}`}>{f.additional_comments}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual Responses */}
            <div className={`rounded-xl border ${card}`}>
              <div className="p-5 border-b border-gray-700">
                <h2 className={`text-sm font-black uppercase tracking-wide ${subtext}`}>All Responses</h2>
              </div>
              <div className="divide-y divide-gray-700">
                {filtered.map(f => (
                  <div key={f.id}>
                    <button
                      className={`w-full px-5 py-4 flex items-center justify-between hover:${isDark ? 'bg-gray-700' : 'bg-gray-50'} transition-colors text-left`}
                      onClick={() => setExpandedRow(expandedRow === f.id ? null : f.id)}
                    >
                      <div>
                        <span className={`font-semibold text-sm ${text}`}>{f.respondent_name}</span>
                        <span className={`text-xs ml-3 ${subtext}`}>{f.session_time}</span>
                        {f.course_name && <span className={`text-xs ml-2 ${subtext}`}>· {f.course_name}</span>}
                        {f.event_date && <span className={`text-xs ml-2 ${subtext}`}>· {new Date(f.event_date + 'T00:00:00').toLocaleDateString('en-GB')}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${ (f.responses?.skills_gained === 'Yes' || f.responses?.skills_gained === true || f.skills_gained) ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
                          {(f.responses?.skills_gained === 'Yes' || f.responses?.skills_gained === true || f.skills_gained) ? 'Skills gained' : 'No new skills'}
                        </span>
                        <span className={`text-xs ${subtext}`}>{expandedRow === f.id ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {expandedRow === f.id && (
                      <div className={`px-5 pb-4 ${isDark ? 'bg-gray-750' : 'bg-gray-50'}`}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          {[
                            { label: 'Knowledge Before', value: f.responses?.knowledge_before ?? f.knowledge_before },
                            { label: 'Knowledge After', value: f.responses?.knowledge_after ?? f.knowledge_after },
                            { label: 'Confidence Before', value: f.responses?.confidence_before ?? f.confidence_before },
                            { label: 'Confidence After', value: f.responses?.confidence_after ?? f.confidence_after },
                            { label: 'Relevance', value: f.responses?.relevance ?? f.work_role_relevance },
                          ].map(({ label, value }) => (
                            <div key={label} className={`rounded-lg p-3 text-center ${isDark ? 'bg-gray-700' : 'bg-white border border-gray-200'}`}>
                              <p className={`text-xs ${subtext} mb-1`}>{label}</p>
                              <p className={`text-xl font-black ${text}`}>{value}/10</p>
                            </div>
                          ))}
                        </div>
                        {(f.responses?.descriptors || f.session_descriptors)?.length > 0 && (
                          <div className="mb-3">
                            <p className={`text-xs font-bold uppercase ${subtext} mb-2`}>Descriptors</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(f.responses?.descriptors || f.session_descriptors).map((d: string) => (
                                <span key={d} className={`text-xs px-2 py-1 rounded-full font-medium ${POSITIVE_DESCRIPTORS.has(d) ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>{d}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(f.responses?.comments || f.additional_comments) && (
                          <div className="mb-3">
                            <p className={`text-xs font-bold uppercase ${subtext} mb-1`}>Comments</p>
                            <p className={`text-sm ${text}`}>{f.responses?.comments || f.additional_comments}</p>
                          </div>
                        )}
                        <div className="flex justify-end mt-2">
                          {confirmDeleteId === f.id ? (
                            <div className="flex items-center gap-2">
                              <span className={`text-xs ${subtext}`}>Are you sure?</span>
                              <button
                                onClick={() => deleteResponse(f.id)}
                                disabled={deletingId === f.id}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                              >
                                {deletingId === f.id ? 'Deleting...' : 'Yes, delete'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(f.id)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors"
                            >
                              Delete response
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
