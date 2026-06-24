'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Icon from './Icon';

export default function FeedbackManagerModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'form' | 'automation' | 'manual'>('form');
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Form Config State
  const [formConfig, setFormConfig] = useState<any>(null);
  const [descriptorsText, setDescriptorsText] = useState('');

  // Automation State
  const [automationSettings, setAutomationSettings] = useState<any>(null);

  // Manual Override State
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  // Testing Mode State
  const [isTestMode, setIsTestMode] = useState(true);
  const [testEmail, setTestEmail] = useState('training@cascade-care.com');
  const [manualLoading, setManualLoading] = useState(false);

  useEffect(() => {
    checkTheme();
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [formRes, autoRes] = await Promise.all([
        supabase.from('feedback_settings').select('*').eq('key', 'default_form').single(),
        supabase.from('feedback_automation_settings').select('*').limit(1).single()
      ]);

      if (formRes.data) {
        const config = formRes.data.config || {};
        // Auto-migration: if old format exists, or no fields yet, use defaults
        if (!config.fields || config.fields.length === 0) {
          config.fields = [
            { id: 'session_time', type: 'radio', label: 'Session Time', options: ['Morning', 'Afternoon', 'All Day'], required: true },
            { id: 'knowledge', type: 'scale', label: 'Knowledge', before_label: 'Before this session', after_label: 'After this session', required: true },
            { id: 'confidence', type: 'scale', label: 'Confidence', before_label: 'Before this session', after_label: 'After this session', required: true },
            { id: 'relevance', type: 'scale', label: 'Relevance', before_label: 'How relevant was this training to your work role?', required: true },
            { id: 'descriptors', type: 'descriptors', label: 'Describe this session (select 5 or more)', options: ['Well tutored', 'Useful', 'Basic', 'Practical', 'Fun', 'Nothing New', 'Professional', 'Informative', 'Boring', 'Motivating', 'Too Long', 'Educational', 'Hard to follow', 'Vague', 'Participative', 'Interactive', 'Disorganised'], required: true },
            { id: 'skills_gained', type: 'radio', label: 'Did you gain new skills?', options: ['Yes', 'No'], required: true },
            { id: 'comments', type: 'text', label: 'Additional Comments', required: false }
          ];
        }
        setFormConfig(config);
        setDescriptorsText(config.descriptors?.join(', ') || '');
      } else {
        // Handle case where no default_form row exists at all
        setFormConfig({ fields: [] });
      }

      if (autoRes.data) {
        setAutomationSettings(autoRes.data);
      }

      // Fetch events for manual override (last 2 days and future 1 day)
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 2);
      const end = new Date(today);
      end.setDate(today.getDate() + 1);

      const { data: events } = await supabase
        .from('training_events')
        .select('*, courses(name), venues:location')
        .gte('event_date', start.toISOString().split('T')[0])
        .lte('event_date', end.toISOString().split('T')[0])
        .order('event_date', { ascending: false });
      
      setRecentEvents(events || []);

    } catch (err) {
      console.error('Error fetching feedback data:', err);
    } finally {
      setLoading(false);
    }
  }

  function checkTheme() {
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('theme');
      const isDarkMode = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setIsDark(isDarkMode);
    }
  }

  const handleSaveForm = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('feedback_settings')
        .update({ config: formConfig, updated_at: new Date().toISOString() })
        .eq('key', 'default_form');

      if (error) throw error;
      setFormConfig(formConfig);
      setMessage({ type: 'success', text: 'Form configuration saved successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save form config' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAutomation = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('feedback_automation_settings')
        .update({
          is_enabled: automationSettings.is_enabled,
          minutes_before_end: automationSettings.minutes_before_end,
          email_subject: automationSettings.email_subject,
          email_body: automationSettings.email_body,
          updated_at: new Date().toISOString()
        })
        .eq('id', automationSettings.id);

      if (error) throw error;
      setMessage({ type: 'success', text: 'Automation settings saved successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save automation settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleManualSend = async (eventId: string) => {
    if (!confirm('Are you sure you want to send feedback emails for this session now?')) return;
    
    setManualLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/automations/feedback-emails', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-email-test-mode': isTestMode ? 'true' : 'false',
          'x-test-email-address': testEmail
        },
        body: JSON.stringify({ eventId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send emails');
      
      setMessage({ type: 'success', text: `Successfully sent ${data.count} feedback emails!` });
      // Refresh events to show sent status
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to send feedback emails' });
    } finally {
      setManualLoading(false);
    }
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-[40px] w-full max-w-4xl max-h-[90vh] shadow-2xl border overflow-hidden flex flex-col transition-colors duration-300">
        
        {/* Header */}
        <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="p-6 border-b flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-xl font-black uppercase tracking-tight">Feedback & Automation</h2>
            <Link
              href="/feedback/results"
              className="px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-blue-500/20"
            >
              View Results
            </Link>
          </div>
          <button onClick={onClose} style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="hover:text-red-500 transition-colors">
            <Icon name="close" className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ backgroundColor: isDark ? '#1a2332' : '#f8fafc', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="flex border-b px-6">
          <button 
            onClick={() => setActiveTab('form')}
            className={`py-4 px-6 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'form' ? 'border-pink-500 text-pink-500' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            Form Editor
          </button>
          <button 
            onClick={() => setActiveTab('automation')}
            className={`py-4 px-6 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'automation' ? 'border-pink-500 text-pink-500' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            Automation Settings
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            className={`py-4 px-6 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'manual' ? 'border-pink-500 text-pink-500' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
          >
            Manual Override
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {message && (
            <div className={`mb-6 p-4 rounded-xl text-sm font-bold ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
              {message.text}
            </div>
          )}

          {activeTab === 'form' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[10px] font-black uppercase text-pink-500">Form Questions Builders</h4>
                  <button 
                    onClick={() => {
                      const newFields = [...(formConfig?.fields || [])];
                      newFields.push({ id: `q_${Date.now()}`, label: 'New Question', type: 'scale', required: true });
                      setFormConfig({...formConfig, fields: newFields});
                    }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all"
                  >
                    + Add Question
                  </button>
                </div>

                <div className="space-y-4">
                  {(formConfig?.fields || []).map((field: any, idx: number) => (
                    <div key={field.id} className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700 space-y-4 relative group">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Question Text</label>
                          <input 
                            type="text" 
                            value={field.label} 
                            onChange={(e) => {
                              const newFields = [...(formConfig?.fields || [])];
                              newFields[idx].label = e.target.value;
                              setFormConfig({...formConfig, fields: newFields});
                            }}
                            className="w-full bg-transparent border-b border-slate-600 text-white font-bold text-sm outline-none pb-1 focus:border-pink-500"
                          />
                        </div>
                        <div className="w-32">
                          <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">Type</label>
                          <select 
                            value={field.type}
                            onChange={(e) => {
                              const newFields = [...(formConfig?.fields || [])];
                              newFields[idx].type = e.target.value;
                              // Clean up options if switching type
                              if (['select', 'multi-select', 'radio'].includes(e.target.value) && !newFields[idx].options) {
                                newFields[idx].options = [];
                              }
                              setFormConfig({...formConfig, fields: newFields});
                            }}
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg p-1.5 text-[10px] font-bold text-white outline-none"
                          >
                            <option value="scale">Scale 1-10</option>
                            <option value="text">Long Text</option>
                            <option value="short_text">Short Text</option>
                            <option value="select">Select Box</option>
                            <option value="multi-select">Multi-Select</option>
                            <option value="radio">Radio Buttons</option>
                            <option value="descriptors">Descriptor Keywords</option>
                          </select>
                        </div>
                        <button 
                          onClick={() => {
                            const newFields = (formConfig?.fields || []).filter((_: any, i: number) => i !== idx);
                            setFormConfig({...formConfig, fields: newFields});
                          }}
                          className="mt-5 text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Icon name="close" className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Specific configs for different types */}
                      {field.type === 'scale' && (
                         <div className="grid grid-cols-2 gap-4 bg-slate-900/40 p-3 rounded-xl">
                            <div>
                              <label className="block text-[8px] font-black uppercase text-slate-600 mb-1">Before Label (Optional)</label>
                              <input 
                                type="text"
                                value={field.before_label || ''}
                                onChange={(e) => {
                                  const newFields = [...(formConfig?.fields || [])];
                                  newFields[idx].before_label = e.target.value;
                                  setFormConfig({...formConfig, fields: newFields});
                                }}
                                className="w-full bg-slate-800 border-none rounded p-1.5 text-[10px] text-slate-300"
                                placeholder="Rate your knowledge BEFORE..."
                              />
                            </div>
                            <div>
                               <label className="block text-[8px] font-black uppercase text-slate-600 mb-1">After Label (Optional)</label>
                               <input 
                                 type="text"
                                 value={field.after_label || ''}
                                 onChange={(e) => {
                                   const newFields = [...(formConfig?.fields || [])];
                                   newFields[idx].after_label = e.target.value;
                                   setFormConfig({...formConfig, fields: newFields});
                                 }}
                                 className="w-full bg-slate-800 border-none rounded p-1.5 text-[10px] text-slate-300"
                                 placeholder="Rate your knowledge AFTER..."
                               />
                            </div>
                         </div>
                      )}

                      {['select', 'multi-select', 'radio', 'descriptors'].includes(field.type) && (
                        <div className="bg-slate-900/40 p-3 rounded-xl">
                          <label className="block text-[8px] font-black uppercase text-slate-600 mb-1">Options (Comma separated)</label>
                          <textarea 
                            value={field.type === 'descriptors' ? (field.options || []).join(', ') : (field.options || []).join(', ')}
                            onChange={(e) => {
                              const newFields = [...(formConfig?.fields || [])];
                              newFields[idx].options = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                              setFormConfig({...formConfig, fields: newFields});
                            }}
                            className="w-full bg-slate-800 border-none rounded p-2 text-[10px] text-slate-300 h-16 resize-none"
                            placeholder="Option 1, Option 2, etc."
                          />
                        </div>
                      )}

                      {/* Reordering Buttons */}
                      <div className="flex gap-2 justify-end">
                        <button 
                          disabled={idx === 0}
                          onClick={() => {
                            const newFields = [...(formConfig?.fields || [])];
                            [newFields[idx], newFields[idx-1]] = [newFields[idx-1], newFields[idx]];
                            setFormConfig({...formConfig, fields: newFields});
                          }}
                          className="bg-slate-700 hover:bg-slate-600 p-1 rounded disabled:opacity-30"
                        >
                          <Icon name="back" className="w-3 h-3 rotate-90" />
                        </button>
                        <button 
                          disabled={idx === (formConfig?.fields?.length || 0) - 1}
                          onClick={() => {
                            const newFields = [...(formConfig?.fields || [])];
                            [newFields[idx], newFields[idx+1]] = [newFields[idx+1], newFields[idx]];
                            setFormConfig({...formConfig, fields: newFields});
                          }}
                          className="bg-slate-700 hover:bg-slate-600 p-1 rounded disabled:opacity-30"
                        >
                          <Icon name="back" className="w-3 h-3 -rotate-90" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleSaveForm}
                disabled={saving}
                className="w-full py-4 bg-pink-600 hover:bg-pink-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Form Configuration'}
              </button>
            </div>
          )}

          {activeTab === 'automation' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                <div>
                  <h4 className="font-bold text-white mb-1">Enable Automation</h4>
                  <p className="text-xs text-slate-500">Automatically send feedback emails 30 mins before session ends.</p>
                </div>
                <button 
                  onClick={() => setAutomationSettings({...automationSettings, is_enabled: !automationSettings.is_enabled})}
                  className={`w-14 h-8 rounded-full transition-all relative ${automationSettings?.is_enabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${automationSettings?.is_enabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-2">Minutes Before End Time</label>
                  <input 
                    type="number"
                    value={automationSettings?.minutes_before_end}
                    onChange={(e) => setAutomationSettings({...automationSettings, minutes_before_end: parseInt(e.target.value)})}
                    style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                    className="w-full px-4 py-3 border rounded-xl outline-none font-bold text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-2">Email Subject</label>
                  <input 
                    type="text"
                    value={automationSettings?.email_subject}
                    onChange={(e) => setAutomationSettings({...automationSettings, email_subject: e.target.value})}
                    style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                    className="w-full px-4 py-3 border rounded-xl outline-none font-bold text-sm"
                    placeholder="e.g. Feedback for {{course_name}}"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-2">Email Body</label>
                  <textarea 
                    value={automationSettings?.email_body}
                    onChange={(e) => setAutomationSettings({...automationSettings, email_body: e.target.value})}
                    style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                    className="w-full h-48 px-4 py-3 border rounded-xl outline-none font-medium text-sm"
                    placeholder="Use {{staff_name}}, {{course_name}}, and {{feedback_link}} as placeholders."
                  />
                </div>
              </div>

              <button 
                onClick={handleSaveAutomation}
                disabled={saving}
                className="w-full py-4 bg-pink-600 hover:bg-pink-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Automation Settings'}
              </button>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-2xl mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-amber-500 font-black text-[10px] uppercase tracking-wider mb-1">Testing Mode</h5>
                    <p className="text-[10px] text-amber-500/70 font-bold max-w-sm">When enabled, emails will ONLY be sent to the test address below, rather than the session participants.</p>
                  </div>
                  <button 
                    onClick={() => setIsTestMode(!isTestMode)}
                    className={`w-12 h-6 rounded-full transition-all relative ${isTestMode ? 'bg-amber-500' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isTestMode ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {isTestMode && (
                  <div className="pt-2">
                    <label className="block text-[8px] font-black uppercase text-amber-500/50 mb-1">Test Recipient Address</label>
                    <input 
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="w-full bg-slate-900/50 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-white font-bold outline-none focus:border-amber-500"
                      placeholder="Enter test email address"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {recentEvents.length === 0 ? (
                  <p className="text-center py-8 text-slate-500 text-sm">No recent sessions found.</p>
                ) : (
                  recentEvents.map((event) => (
                    <div 
                      key={event.id}
                      style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', borderColor: isDark ? '#334155' : '#e2e8f0' }}
                      className="p-4 border rounded-2xl flex items-center justify-between"
                    >
                      <div>
                        <h5 className="font-bold text-sm text-white">{event.courses?.name}</h5>
                        <p className="text-[10px] text-slate-500 uppercase font-black">
                          {new Date(event.event_date).toLocaleDateString()} @ {event.venues} ({event.start_time.slice(0,5)} - {event.end_time.slice(0,5)})
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {event.feedback_sent_at && (
                          <span className="text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">Sent ✓</span>
                        )}
                        <button 
                          onClick={() => handleManualSend(event.id)}
                          disabled={manualLoading}
                          className="px-4 py-2 bg-slate-700 hover:bg-pink-600 text-white text-[10px] font-black uppercase rounded-lg transition-all"
                        >
                          Send Emails
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
