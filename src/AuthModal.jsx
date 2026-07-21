import React, { useState } from 'react';
import { supabase } from './utils/supabaseClient';

const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export default function AuthModal({ onAuth, collegeMapping = {} }) {
  const [step, setStep] = useState('choice'); // 'choice' | 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const colleges = Object.keys(collegeMapping);
  const [college, setCollege] = useState('');
  const [department, setDepartment] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGuest = async () => {
    // 비회원 접속 기록
    await supabase.from('visits').insert([{
      user_agent: navigator.userAgent,
      referrer: document.referrer || ''
    }]);
    onAuth({ type: 'guest' });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const hash = await hashPassword(password);
      const { data, error: dbErr } = await supabase
        .from('app_users')
        .select('id, username, college, department')
        .eq('username', username.trim())
        .eq('password_hash', hash)
        .single();

      if (dbErr || !data) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }
      localStorage.setItem('app_user', JSON.stringify(data));
      onAuth({ type: 'member', user: data });
    } catch (err) {
      setError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    if (!college || !department) {
      setError('단과대와 학과를 선택해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const hash = await hashPassword(password);
      const { data, error: dbErr } = await supabase
        .from('app_users')
        .insert([{ 
          username: username.trim(), 
          password_hash: hash,
          college: college,
          department: department || (collegeMapping[college]?.[0] || '')
        }])
        .select('id, username, college, department')
        .single();

      if (dbErr) {
        if (dbErr.code === '23505') {
          setError('이미 사용중인 아이디입니다.');
        } else {
          setError('회원가입 실패: ' + dbErr.message);
        }
        return;
      }
      localStorage.setItem('app_user', JSON.stringify(data));
      onAuth({ type: 'member', user: data });
    } catch (err) {
      setError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(15, 15, 30, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const cardStyle = {
    background: 'white',
    borderRadius: '20px',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.2rem',
  };

  const inputStyle = {
    width: '100%',
    padding: '0.8rem 1rem',
    borderRadius: '10px',
    border: '1.5px solid #e0e0e0',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    background: '#fff',
  };

  const btnPrimary = {
    width: '100%',
    padding: '0.9rem',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #5c6bc0, #3949ab)',
    color: 'white',
    fontWeight: '700',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  };

  const btnSecondary = {
    width: '100%',
    padding: '0.9rem',
    borderRadius: '10px',
    border: '2px solid #5c6bc0',
    background: 'transparent',
    color: '#5c6bc0',
    fontWeight: '700',
    fontSize: '1rem',
    cursor: 'pointer',
  };

  if (step === 'choice') {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗓️</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1a1a2e', marginBottom: '0.3rem' }}>수강신청 도우미</h2>
            <p style={{ color: '#888', fontSize: '0.9rem' }}>이용 방법을 선택해주세요</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <button style={btnPrimary} onClick={() => setStep('login')}>
              🔐 회원 로그인 / 회원가입
            </button>
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: '0.8rem' }}>
              회원은 시간표를 최대 3개까지 저장할 수 있습니다
            </div>
            <button style={btnSecondary} onClick={handleGuest}>
              👤 비회원으로 시작
            </button>
            <div style={{ textAlign: 'center', color: '#aaa', fontSize: '0.8rem' }}>
              비회원은 시간표 이미지 다운로드만 가능합니다
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{step === 'login' ? '🔑' : '✏️'}</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1a1a2e' }}>
            {step === 'login' ? '로그인' : '회원가입'}
          </h2>
        </div>

        <form onSubmit={step === 'login' ? handleLogin : handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input
            style={inputStyle}
            type="text"
            placeholder="아이디"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
          />
          <input
            style={inputStyle}
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          {step === 'signup' && colleges.length > 0 && (
            <>
              <select
                style={inputStyle}
                value={college}
                onChange={e => {
                  setCollege(e.target.value);
                  setDepartment('');
                }}
              >
                <option value="">단과대 선택</option>
                {colleges.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              
              <select
                style={inputStyle}
                value={department}
                onChange={e => setDepartment(e.target.value)}
              >
                <option value="">학과 선택</option>
                {(collegeMapping[college] || []).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </>
          )}

          {error && (
            <div style={{ color: '#e53935', fontSize: '0.85rem', textAlign: 'center', padding: '0.5rem', background: '#ffebee', borderRadius: '8px' }}>
              {error}
            </div>
          )}
          <button type="submit" style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? '처리중...' : (step === 'login' ? '로그인' : '회원가입')}
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
          <button
            style={{ background: 'none', border: 'none', color: '#5c6bc0', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600' }}
            onClick={() => { setStep(step === 'login' ? 'signup' : 'login'); setError(''); }}
          >
            {step === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
          <button
            style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.85rem' }}
            onClick={() => setStep('choice')}
          >
            ← 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
