import React, { useState, useEffect } from 'react';
import { supabase } from './utils/supabaseClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function AdminModal({ onClose }) {
  const [stats, setStats] = useState({ totalVisits: 0, todayVisits: 0, yesterdayVisits: 0, totalUsers: 0 });
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('specific'); // 'specific', 'week', 'month', 'all'
  const [showVisitors, setShowVisitors] = useState(true);
  const [showUsers, setShowUsers] = useState(true);
  
  // 한국 시간(KST) 기준 날짜/시간 정보를 반환하는 헬퍼 함수
  const getKstComponents = (dateVal) => {
    const d = dateVal ? new Date(dateVal) : new Date();
    // d.getTime()은 절대 UTC 시간(ms)
    // 여기에 9시간을 더한 뒤 UTC 메서드를 사용하면 KST 값을 얻을 수 있음
    const kstMs = d.getTime() + (9 * 60 * 60 * 1000);
    const kst = new Date(kstMs);
    return {
      year: kst.getUTCFullYear(),
      month: kst.getUTCMonth(),
      date: kst.getUTCDate(),
      hours: kst.getUTCHours(),
    };
  };

  // KST 자정을 나타내는 정확한 UTC Date 객체 반환
  const getKstMidnightUTC = (dateVal) => {
    const kst = getKstComponents(dateVal);
    // KST 자정은 UTC 기준으로 전날 15시임 (-9시간)
    return new Date(Date.UTC(kst.year, kst.month, kst.date, -9, 0, 0, 0));
  };

  const getTodayString = () => {
    const kst = getKstComponents();
    return `${kst.year}-${String(kst.month + 1).padStart(2, '0')}-${String(kst.date).padStart(2, '0')}`;
  };

  const [selectedDate, setSelectedDate] = useState(getTodayString());

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const today = getKstMidnightUTC();
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

        // 1. 상단 고정 통계 (항상 전체 데이터 기준으로 계산)
        const [
          totalVisitsRes, todayVisitsRes, yesterdayVisitsRes, totalUsersRes
        ] = await Promise.all([
          supabase.from('visits').select('*', { count: 'exact', head: true }),
          supabase.from('visits').select('*', { count: 'exact', head: true }).gte('visited_at', today.toISOString()),
          supabase.from('visits').select('*', { count: 'exact', head: true }).gte('visited_at', yesterday.toISOString()).lt('visited_at', today.toISOString()),
          supabase.from('app_users').select('*', { count: 'exact', head: true })
        ]);

        setStats({ 
          totalVisits: totalVisitsRes.count || 0, 
          todayVisits: todayVisitsRes.count || 0, 
          yesterdayVisits: yesterdayVisitsRes.count || 0, 
          totalUsers: totalUsersRes.count || 0 
        });

        // 2. 그래프용 데이터 패칭 (period에 따라 다름)
        let vQuery = supabase.from('visits').select('visited_at').not('visited_at', 'is', null);
        let uQuery = supabase.from('app_users').select('created_at').not('created_at', 'is', null);

        if (period === 'specific') {
          const [y, m, d] = selectedDate.split('-').map(Number);
          const targetDay = new Date(Date.UTC(y, m - 1, d, -9, 0, 0, 0));
          const nextDay = new Date(targetDay.getTime() + 24 * 60 * 60 * 1000);

          vQuery = vQuery.gte('visited_at', targetDay.toISOString()).lt('visited_at', nextDay.toISOString());
          uQuery = uQuery.gte('created_at', targetDay.toISOString()).lt('created_at', nextDay.toISOString());
        } else if (period === 'week') {
          const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
          vQuery = vQuery.gte('visited_at', weekAgo.toISOString());
          uQuery = uQuery.gte('created_at', weekAgo.toISOString());
        } else if (period === 'month') {
          const monthAgo = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
          vQuery = vQuery.gte('visited_at', monthAgo.toISOString());
          uQuery = uQuery.gte('created_at', monthAgo.toISOString());
        }

        // 실패해도 다른 그래프는 그리도록 allSettled 사용
        const [vRes, uRes] = await Promise.allSettled([vQuery, uQuery]);
        
        const vData = vRes.status === 'fulfilled' && vRes.value.data ? vRes.value.data : [];
        const uData = uRes.status === 'fulfilled' && uRes.value.data ? uRes.value.data : [];

        // 3. 차트 데이터 가공
        let finalChartData = [];

        if (period === 'all') {
          const allMap = new Map();
          const processRow = (row, type, timeColumn) => {
            const kst = getKstComponents(row[timeColumn]);
            const sortKey = `${kst.year}-${String(kst.month+1).padStart(2,'0')}-${String(kst.date).padStart(2,'0')}`;
            if (!allMap.has(sortKey)) allMap.set(sortKey, { sortKey, 방문자: 0, 가입자: 0 });
            allMap.get(sortKey)[type]++;
          };
          vData.forEach(row => processRow(row, '방문자', 'visited_at'));
          uData.forEach(row => processRow(row, '가입자', 'created_at'));

          finalChartData = Array.from(allMap.values())
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
            .map(item => ({
              name: item.sortKey.slice(2).replace(/-/g, '/'),
              방문자: item.방문자,
              가입자: item.가입자
            }));
        } else {
          const map = new Map();
          if (period === 'specific') {
            for(let i=0; i<24; i++) {
              const key = `${String(i).padStart(2, '0')}시`;
              map.set(key, { name: key, 방문자: 0, 가입자: 0 });
            }
          } else if (period === 'week') {
            for(let i=6; i>=0; i--) {
              const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
              const kst = getKstComponents(d);
              const key = `${kst.month + 1}/${kst.date}`;
              map.set(key, { name: key, 방문자: 0, 가입자: 0 });
            }
          } else if (period === 'month') {
            for(let i=29; i>=0; i--) {
              const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
              const kst = getKstComponents(d);
              const key = `${kst.month + 1}/${kst.date}`;
              map.set(key, { name: key, 방문자: 0, 가입자: 0 });
            }
          }

          const formatKey = (isoString) => {
            if (!isoString) return '';
            const kst = getKstComponents(isoString);
            if (period === 'specific') return `${String(kst.hours).padStart(2, '0')}시`;
            if (period === 'week' || period === 'month') return `${kst.month + 1}/${kst.date}`;
            return '';
          };

          vData.forEach(row => {
            const key = formatKey(row.visited_at);
            if (map.has(key)) map.get(key).방문자++;
          });
          uData.forEach(row => {
            const key = formatKey(row.created_at);
            if (map.has(key)) map.get(key).가입자++;
          });

          finalChartData = Array.from(map.values());
        }

        setChartData(finalChartData);
      } catch (err) {
        console.error("Admin dashboard error", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [period, selectedDate]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '1.5rem', width: '100%', maxWidth: '800px', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', border: '1px solid #e2e5e8', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '90vh' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#888' }}>✕</button>
        
        <h2 style={{ margin: 0, color: '#333', fontSize: '1.2rem', fontWeight: 'bold' }}>
          통계 대시보드
        </h2>

        {/* 상단 통계 수치 (티스토리 UI 스타일) */}
        <div style={{ display: 'flex', backgroundColor: 'white', border: '1px solid #e2e5e8', borderRadius: '6px', padding: '1.5rem', alignItems: 'center', overflowX: 'auto', marginTop: '0.5rem' }}>
          <div style={{ flex: 1, padding: '0 1rem', minWidth: '90px' }}>
            <div style={{ fontSize: '0.8rem', color: '#777', marginBottom: '0.8rem' }}>오늘 방문자</div>
            <div style={{ fontSize: '1.8rem', fontWeight: '500', color: '#222' }}>{stats.todayVisits.toLocaleString()}</div>
          </div>
          <div style={{ width: '1px', height: '50px', backgroundColor: '#e2e5e8' }}></div>
          <div style={{ flex: 1, padding: '0 1rem', minWidth: '90px' }}>
            <div style={{ fontSize: '0.8rem', color: '#777', marginBottom: '0.8rem' }}>어제 방문자</div>
            <div style={{ fontSize: '1.8rem', fontWeight: '500', color: '#222' }}>{stats.yesterdayVisits.toLocaleString()}</div>
          </div>
          <div style={{ width: '1px', height: '50px', backgroundColor: '#e2e5e8' }}></div>
          <div style={{ flex: 1, padding: '0 1rem', minWidth: '90px' }}>
            <div style={{ fontSize: '0.8rem', color: '#777', marginBottom: '0.8rem' }}>누적 방문자</div>
            <div style={{ fontSize: '1.8rem', fontWeight: '500', color: '#222' }}>{stats.totalVisits.toLocaleString()}</div>
          </div>
          <div style={{ width: '1px', height: '50px', backgroundColor: '#e2e5e8' }}></div>
          <div style={{ flex: 1, padding: '0 1rem', minWidth: '90px' }}>
            <div style={{ fontSize: '0.8rem', color: '#777', marginBottom: '0.8rem' }}>가입 유저</div>
            <div style={{ fontSize: '1.8rem', fontWeight: '500', color: '#222' }}>{stats.totalUsers.toLocaleString()}</div>
          </div>
        </div>

        {/* 그래프 영역 */}
        <div style={{ backgroundColor: 'white', border: '1px solid #e2e5e8', borderRadius: '6px', padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '350px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#555' }}>방문자 추이</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginRight: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer', color: '#555' }}>
                  <input type="checkbox" checked={showVisitors} onChange={(e) => setShowVisitors(e.target.checked)} style={{ marginRight: '4px' }} />
                  방문자
                </label>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer', color: '#555' }}>
                  <input type="checkbox" checked={showUsers} onChange={(e) => setShowUsers(e.target.checked)} style={{ marginRight: '4px' }} />
                  가입자
                </label>
              </div>

              {period === 'specific' && (
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{ padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid #d1d8e0', fontSize: '0.85rem', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                />
              )}
              <select 
                value={period} 
                onChange={(e) => setPeriod(e.target.value)}
                style={{ padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #d1d8e0', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
              >
                <option value="specific">특정 날짜 (24시간)</option>
                <option value="week">최근 7일</option>
                <option value="month">최근 30일</option>
                <option value="all">전체 누적</option>
              </select>
            </div>
          </div>
          
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontWeight: 'bold' }}>
              그래프 데이터를 불러오는 중입니다...
            </div>
          ) : (
            <div style={{ width: '100%', height: '250px' }}>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData} margin={{ top: 10, right: showUsers ? -20 : 10, left: showVisitors ? -20 : 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} dy={10} />
                  
                  {showVisitors && (
                    <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} allowDecimals={false} />
                  )}
                  {showUsers && (
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} allowDecimals={false} />
                  )}

                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    itemStyle={{ fontWeight: 'bold' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  
                  {showVisitors && <Line yAxisId="left" type="monotone" name="방문자 수" dataKey="방문자" stroke="#ff6b6b" strokeWidth={3} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />}
                  {showUsers && <Line yAxisId="right" type="monotone" name="가입자 수" dataKey="가입자" stroke="#339af0" strokeWidth={3} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
