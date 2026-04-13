import { useState, useEffect, useMemo } from 'react';
import { FileText, Briefcase, Users, Calendar, ChevronDown } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getDocumentsCount } from '../../lib/api/documents';
import { getRequirementsCount } from '../../lib/api/requirements';
import { getInterviewsPage } from '../../lib/api/interviews';
import { getConsultantsPage } from '../../lib/api/consultants';

export const Dashboard = () => {
  const { user } = useAuth();
  const [documentCount, setDocumentCount] = useState(0);
  const [requirementCount, setRequirementCount] = useState(0);
  const [upcomingInterviewCount, setUpcomingInterviewCount] = useState(0);
  const [completedInterviewCount, setCompletedInterviewCount] = useState(0);
  const [activeConsultantCount, setActiveConsultantCount] = useState(0);
  const [placedConsultantCount, setPlacedConsultantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({
    stats: true,
    recentActivity: true,
  });

  const toggleAccordion = (key: string) => {
    setExpandedAccordions(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!user) return;
      const nowIso = new Date().toISOString();
      
      const [docsResult, reqsResult, upcomingInterviewsRes, completedInterviewsRes, activeConsultantsRes, placedConsultantsRes] = await Promise.all([
        getDocumentsCount(user.id),
        getRequirementsCount(user.id),
        getInterviewsPage({ userId: user.id, includeCount: true, limit: 1, offset: 0, scheduledFrom: nowIso, excludeStatus: 'Cancelled' }),
        getInterviewsPage({ userId: user.id, includeCount: true, limit: 1, offset: 0, status: 'Completed' }),
        getConsultantsPage({ userId: user.id, limit: 1, offset: 0, status: 'Active' }),
        getConsultantsPage({ userId: user.id, limit: 1, offset: 0, status: 'Recently Placed' }),
      ]);

      if (cancelled) return;

      if (docsResult.success) setDocumentCount(docsResult.count);
      if (reqsResult.success) setRequirementCount(reqsResult.count);
      if (upcomingInterviewsRes.success) setUpcomingInterviewCount(upcomingInterviewsRes.total ?? 0);
      if (completedInterviewsRes.success) setCompletedInterviewCount(completedInterviewsRes.total ?? 0);
      if (activeConsultantsRes.success) setActiveConsultantCount(activeConsultantsRes.total ?? 0);
      if (placedConsultantsRes.success) setPlacedConsultantCount(placedConsultantsRes.total ?? 0);
      setLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const stats = useMemo(() => [
    { label: 'Total Documents', value: documentCount, icon: FileText, color: 'text-primary-800 bg-primary-50' },
    { label: 'Active Requirements', value: requirementCount, icon: Briefcase, color: 'text-green-600 bg-green-50' },
    { label: 'Upcoming Interviews', value: upcomingInterviewCount, icon: Calendar, color: 'text-orange-600 bg-orange-50', subtitle: `Completed: ${completedInterviewCount}` },
    { label: 'Active Consultants', value: activeConsultantCount, icon: Users, color: 'text-purple-600 bg-purple-50', subtitle: `Recently Placed: ${placedConsultantCount}` },
  ], [documentCount, requirementCount, upcomingInterviewCount, completedInterviewCount, activeConsultantCount, placedConsultantCount]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-xs font-medium text-gray-900">
          Welcome back, {user?.full_name} 👋
        </h1>
        <p className="text-gray-500 mt-1">
          Here’s your updated resume management overview
        </p>
      </header>

      {/* Stats Section Accordion */}
      <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleAccordion('stats')}
          className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition"
        >
          <h2 className="text-lg font-semibold text-gray-900">Statistics Overview</h2>
          <ChevronDown
            className={`w-5 h-5 text-gray-600 transition-transform ${
              expandedAccordions.stats ? 'rotate-180' : ''
            }`}
          />
        </button>
        
        {expandedAccordions.stats && (
          <div className="border-t border-gray-200 p-6">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-24 mb-2 animate-pulse" />
                        <div className="h-8 bg-gray-200 rounded w-16 animate-pulse" />
                      </div>
                      <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map(({ label, value, icon: Icon, color, subtitle }) => (
                  <div
                    key={label}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:-translate-y-0.5 transition-transform"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="text-xs font-medium text-gray-900 mt-1">{value}</p>
                        {subtitle && <p className="text-xs text-gray-400 mt-2">{subtitle}</p>}
                      </div>
                      <div className={`p-3 rounded-lg ${color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Activity Accordion */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleAccordion('recentActivity')}
          className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition"
        >
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <ChevronDown
            className={`w-5 h-5 text-gray-600 transition-transform ${
              expandedAccordions.recentActivity ? 'rotate-180' : ''
            }`}
          />
        </button>
        
        {expandedAccordions.recentActivity && (
          <div className="border-t border-gray-200 p-6">
            <div className="text-gray-500 text-center py-10 italic">
              No recent activity to display
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
