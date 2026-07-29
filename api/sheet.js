// Vercel 서버리스 함수: 서비스 계정으로 Google Sheets의 "projects" 탭을 읽어
// { "rows": [[...], ...] } 형태의 JSON으로 응답한다.
// 자격 증명은 코드에 두지 않고 환경변수에서만 읽는다.
const { JWT } = require('google-auth-library');

const SHEET_RANGE = 'projects'; // 읽어올 시트 탭 이름
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

module.exports = async (req, res) => {
  try {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    // Vercel 환경변수에 저장된 개인키의 "\n" 문자를 실제 줄바꿈으로 복원한다.
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!sheetId || !clientEmail || !privateKey) {
      res.status(500).json({
        error: 'Missing environment variables',
        detail: 'GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 를 설정하세요.',
      });
      return;
    }

    // 서비스 계정 JWT로 읽기 전용 액세스 토큰 발급
    const client = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: SCOPES,
    });
    const { token } = await client.getAccessToken();

    // Sheets REST API v4 로 지정 탭의 값을 조회
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
      `/values/${encodeURIComponent(SHEET_RANGE)}`;

    const apiRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      res.status(apiRes.status).json({ error: 'Google Sheets API error', detail });
      return;
    }

    const data = await apiRes.json();

    // CDN 캐시: 60초 신선, 이후 5분간 stale 허용
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ rows: data.values || [] });
  } catch (err) {
    res.status(500).json({
      error: 'Internal error',
      detail: String((err && err.message) || err),
    });
  }
};
