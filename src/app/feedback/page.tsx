'use client';

import { useState, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface ScaleQuestion {
  id: string;
  label: string;
  questions: Array<{
    id: string;
    label: string;
    required: boolean;
  }>;
}

interface BooleanQuestion {
  id: string;
  label: string;
  required: boolean;
  options: Array<{
    label: string;
    value: boolean;
  }>;
}

interface TextQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea';
  required: boolean;
  placeholder?: string;
  rows?: number;
}

interface FormConfig {
  descriptor_options: string[];
  min_descriptors: number;
  scale_questions: ScaleQuestion[];
  boolean_questions: BooleanQuestion[];
  text_questions: TextQuestion[];
  session_time_options: string[];
  session_time_required: boolean;
}

function ScaleInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-5">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-semibold text-slate-300">{label}</label>
        <span className="text-lg font-bold text-blue-400 w-6 text-right">{value}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-500 cursor-pointer"
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>Not very (1)</span>
        <span>Very much (10)</span>
      </div>
    </div>
  );
}

function FeedbackForm() {
  const searchParams = useSearchParams();
  const courseName = searchParams?.get('course') || '';
  const eventDate = searchParams?.get('date') || '';
  const eventId = searchParams?.get('event') || '';

  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [scaleValues, setScaleValues] = useState<Record<string, number>>({});
  const [booleanValues, setBooleanValues] = useState<Record<string, boolean | null>>({});
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [selectedDescriptors, setSelectedDescriptors] = useState<string[]>([]);
  const [sessionTime, setSessionTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    const { data } = await supabase
      .from('feedback_form_config')
      .select('*')
      .eq('is_active', true)
      .single();
    
    if (data) {
      setConfig(data);
      
      // Initialize default values
      const initialScaleValues: Record<string, number> = {};
      data.scale_questions.forEach((scale: { questions: Array<{ id: string }> }) => {
        scale.questions.forEach((question: { id: string }) => {
          initialScaleValues[question.id] = 5;
        });
      });
      setScaleValues(initialScaleValues);

      const initialBooleanValues: Record<string, boolean | null> = {};
      data.boolean_questions.forEach((question: { id: string }) => {
        initialBooleanValues[question.id] = null;
      });
      setBooleanValues(initialBooleanValues);

      const initialTextValues: Record<string, string> = {};
      data.text_questions.forEach((question: { id: string }) => {
        initialTextValues[question.id] = '';
      });
      setTextValues(initialTextValues);
    }
    setLoadingConfig(false);
  }

  const toggleDescriptor = (d: string) => {
    setSelectedDescriptors(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    // Validate required text fields
    for (const question of config.text_questions) {
      if (question.required && !textValues[question.id]?.trim()) {
        setError(`Please enter ${question.label.toLowerCase()}.`);
        return;
      }
    }

    // Validate session time if required
    if (config.session_time_required && !sessionTime) {
      setError('Please select a session time.');
      return;
    }

    // Validate descriptors
    if (selectedDescriptors.length < config.min_descriptors) {
      setError(`Please select at least ${config.min_descriptors} words to describe the session.`);
      return;
    }

    // Validate required boolean fields
    for (const question of config.boolean_questions) {
      if (question.required && booleanValues[question.id] === null) {
        setError(`Please answer: ${question.label}`);
        return;
      }
    }

    setError('');
    setSubmitting(true);

    // Soft duplicate check — same name + course + date
    const nameValue = textValues['respondent_name'] || '';
    if (courseName && eventDate && nameValue) {
      const { data: existing } = await supabase
        .from('course_feedback')
        .select('id')
        .eq('respondent_name', nameValue.trim())
        .eq('course_name', courseName)
        .eq('event_date', eventDate)
        .limit(1);
      if (existing && existing.length > 0) {
        setError('It looks like you have already submitted feedback for this session. Thank you!');
        setSubmitting(false);
        return;
      }
    }

    // Build the submission data
    const submissionData: any = {
      event_id: eventId || null,
      course_name: courseName || null,
      event_date: eventDate || null,
      respondent_name: nameValue.trim(),
      session_time: sessionTime,
      session_descriptors: selectedDescriptors,
    };

    // Add scale values
    config.scale_questions.forEach(scale => {
      scale.questions.forEach(question => {
        submissionData[question.id] = scaleValues[question.id];
      });
    });

    // Add boolean values
    config.boolean_questions.forEach(question => {
      submissionData[question.id] = booleanValues[question.id];
    });

    // Add text values (excluding respondent_name which is already handled)
    config.text_questions.forEach(question => {
      if (question.id !== 'respondent_name') {
        submissionData[question.id] = textValues[question.id]?.trim() || null;
      }
    });

    const { error: dbError } = await supabase.from('course_feedback').insert(submissionData);

    setSubmitting(false);
    if (dbError) {
      setError('Something went wrong submitting your feedback. Please try again.');
    } else {
      setSubmitted(true);
    }
  };

  if (loadingConfig) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-2xl font-black text-white mb-2 uppercase">Loading...</h2>
          <p className="text-slate-400">Preparing your feedback form.</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-black text-white mb-2 uppercase">Form Not Available</h2>
          <p className="text-slate-400">The feedback form is not currently configured.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-black text-white mb-2 uppercase">Thank You!</h2>
          <p className="text-slate-400">Your feedback has been submitted. We appreciate you taking the time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-800 rounded-2xl overflow-hidden shadow-2xl">

          {/* Header */}
          <div className="bg-blue-700 px-6 py-6">
            <h1 className="text-xl font-black text-white uppercase tracking-tight">Training Feedback</h1>
            {courseName && <p className="text-blue-200 font-semibold mt-1">{courseName}</p>}
            {eventDate && (
              <p className="text-blue-300 text-sm mt-0.5">
                {new Date(eventDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">

            {/* Dynamic Text Questions */}
            {config.text_questions.map((question) => (
              <div key={question.id}>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  {question.label} {question.required && <span className="text-red-400">*</span>}
                </label>
                {question.type === 'textarea' ? (
                  <textarea
                    value={textValues[question.id] || ''}
                    onChange={e => setTextValues({...textValues, [question.id]: e.target.value})}
                    rows={question.rows || 3}
                    placeholder={question.placeholder || ''}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                  />
                ) : (
                  <input
                    type="text"
                    value={textValues[question.id] || ''}
                    onChange={e => setTextValues({...textValues, [question.id]: e.target.value})}
                    placeholder={question.placeholder || ''}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                )}
              </div>
            ))}

            {/* Session Time */}
            {config.session_time_options.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Session Time {config.session_time_required && <span className="text-red-400">*</span>}
                </label>
                <div className="flex gap-3">
                  {config.session_time_options.map((time) => (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setSessionTime(time)}
                      className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                        sessionTime === time
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Scale Questions */}
            {config.scale_questions.map((scale) => (
              <div key={scale.id} className="bg-slate-700/50 rounded-xl p-4">
                <h3 className="text-sm font-black text-slate-200 uppercase tracking-wide mb-4">{scale.label}</h3>
                {scale.questions.map((question) => (
                  <ScaleInput
                    key={question.id}
                    label={question.label}
                    value={scaleValues[question.id] || 5}
                    onChange={(value) => setScaleValues({...scaleValues, [question.id]: value})}
                  />
                ))}
              </div>
            ))}

            {/* Descriptors */}
            {config.descriptor_options.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-1">
                  Describe this session <span className="text-slate-500 font-normal">(select {config.min_descriptors} or more)</span>
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  {selectedDescriptors.length < config.min_descriptors
                    ? `Select at least ${config.min_descriptors - selectedDescriptors.length} more`
                    : `${selectedDescriptors.length} selected ✓`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {config.descriptor_options.map((descriptor) => (
                    <button
                      key={descriptor}
                      type="button"
                      onClick={() => toggleDescriptor(descriptor)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        selectedDescriptors.includes(descriptor)
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {descriptor}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Boolean Questions */}
            {config.boolean_questions.map((question) => (
              <div key={question.id}>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  {question.label} {question.required && <span className="text-red-400">*</span>}
                </label>
                <div className="flex gap-3">
                  {question.options.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setBooleanValues({...booleanValues, [question.id]: option.value})}
                      className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                        booleanValues[question.id] === option.value
                          ? option.value ? 'bg-green-600 text-white shadow-md' : 'bg-red-600 text-white shadow-md'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {error && (
              <p className="text-red-400 text-sm font-semibold bg-red-400/10 px-4 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-black rounded-xl text-base uppercase tracking-wide transition-all shadow-lg"
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    }>
      <FeedbackForm />
    </Suspense>
  );
}
