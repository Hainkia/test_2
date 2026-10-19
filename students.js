const $ = (selector) => document.querySelector(selector);
const PAGE_SIZE = 20;
const fields = ['student_number','grade_term','course_unit','activity_title','evidence','project','contribution','problem_solving','reflection'];
let client, user, teacher = false, page = 0, generation = 0, historyRequest = 0;

function notice(message, error = false) {
  $('#notice').textContent = message;
  $('#notice').dataset.error = String(error);
}
function readableError(error) {
  if (error?.message === 'Invalid login credentials') return '이메일 또는 비밀번호를 확인해 주세요.';
  if (error?.message === 'Email not confirmed') return '가입한 이메일에서 인증을 완료한 뒤 로그인해 주세요.';
  if (error?.code === '42501') return '저장 또는 조회 권한이 없습니다. 선생님께 문의해 주세요.';
  if (['42P01','PGRST205'].includes(error?.code)) return '제출함 설정이 아직 완료되지 않았습니다. 선생님께 문의해 주세요.';
  return '요청을 처리하지 못했습니다. 연결 상태와 입력 내용을 확인한 뒤 다시 시도해 주세요.';
}

async function updateAccount(session) {
  const version = ++generation;
  ++historyRequest;
  user = session?.user || null;
  teacher = false;
  page = 0;
  $('#records').replaceChildren();
  $('#history-panel').hidden = true;
  $('#submission-panel').hidden = true;
  $('#account-panel').hidden = !user;
  $('#auth-panel').hidden = !!user;
  if (!user) { notice('로그인 후 활동을 제출하고 내 제출 내역을 확인할 수 있습니다.'); return; }
  const accountId = user.id;
  $('#account-label').textContent = '계정 확인 중…';
  const { data, error } = await client.from('teacher_roles').select('user_id').eq('user_id', accountId).maybeSingle();
  if (version !== generation) return;
  if (error) { notice(readableError(error), true); return; }
  teacher = !!data;
  $('#account-label').textContent = `${user.email} · ${teacher ? '교사' : '학생'}`;
  $('#submission-panel').hidden = teacher;
  $('#history-panel').hidden = false;
  $('#filter-form').hidden = !teacher;
  $('#history-title').textContent = teacher ? '학생 제출함' : '내 제출 내역';
  notice(teacher ? '학생이 직접 작성한 기록입니다. 사실을 확인한 뒤 세특 초안에 활용해 주세요.' : '실제로 수행한 활동을 구체적으로 적어 주세요.');
  await loadHistory();
}

function renderRecord(record) {
  const details = document.createElement('details');
  details.className = 'record';
  const summary = document.createElement('summary');
  summary.textContent = `${record.student_number} · ${record.course_unit} · ${record.activity_title}`;
  const meta = document.createElement('p');
  meta.className = 'record-meta';
  meta.textContent = `${record.grade_term} · ${new Date(record.created_at).toLocaleString('ko-KR')}`;
  const list = document.createElement('dl');
  for (const [key, label] of Object.entries({evidence:'수행 활동과 근거',project:'팀 프로젝트',contribution:'개인 기여',problem_solving:'문제 해결',reflection:'배운 점과 성찰'})) {
    const term = document.createElement('dt'), description = document.createElement('dd');
    term.textContent = label; description.textContent = record[key] || '입력 없음'; list.append(term, description);
  }
  details.append(summary, meta, list);
  if (teacher) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'download-button'; button.textContent = '이 기록으로 세특 초안 작성';
    button.addEventListener('click', () => {
      try {
        const payload = Object.fromEntries(fields.map(key => [key, record[key]]));
        sessionStorage.setItem('student-evidence-import', JSON.stringify(payload));
        location.assign('/');
      } catch { notice('브라우저의 임시 저장을 허용한 뒤 다시 시도해 주세요.', true); }
    });
    details.append(button);
  }
  return details;
}

async function loadHistory() {
  if (!user) return;
  const version = generation, request = ++historyRequest;
  $('#records').replaceChildren();
  $('#history-status').textContent = '기록을 불러오는 중…';
  $('#previous').disabled = $('#next').disabled = true;
  try {
    let query = client.from('student_submissions').select('id,student_number,grade_term,course_unit,activity_title,evidence,project,contribution,problem_solving,reflection,created_at', {count:'exact'});
    if (!teacher) query = query.eq('user_id', user.id);
    if (teacher && $('#filter-number').value.trim()) query = query.eq('student_number', $('#filter-number').value.trim());
    if (teacher && $('#filter-course').value.trim()) query = query.eq('course_unit', $('#filter-course').value.trim());
    const {data, error, count} = await query.order('created_at', {ascending:false}).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (version !== generation || request !== historyRequest) return;
    if (error) throw error;
    $('#records').replaceChildren(...data.map(renderRecord));
    $('#history-status').textContent = count ? `총 ${count}건 · 최신 기록부터 표시합니다.` : '제출한 기록이 없습니다.';
    $('#page-label').textContent = `${page + 1}페이지`;
    $('#previous').disabled = page === 0;
    $('#next').disabled = (page + 1) * PAGE_SIZE >= count;
  } catch (error) {
    if (version !== generation || request !== historyRequest) return;
    $('#history-status').textContent = '기록을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.';
    notice(readableError(error), true);
  }
}

async function authenticate(signup) {
  if (!$('#auth-form').reportValidity()) return;
  $('#auth-fields').disabled = true;
  try {
    const credentials = {email:$('#email').value.trim(), password:$('#password').value};
    const {data, error} = signup ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);
    if (error) throw error;
    $('#password').value = '';
    if (signup && !data.session) notice('가입 요청을 보냈습니다. 이메일에서 인증을 완료한 뒤 이 페이지에서 로그인해 주세요.');
  } catch (error) { notice(readableError(error), true); }
  finally { $('#auth-fields').disabled = false; }
}
$('#auth-form').addEventListener('submit', event => { event.preventDefault(); void authenticate(false); });
$('#signup').addEventListener('click', () => void authenticate(true));
$('#logout').addEventListener('click', async () => {
  $('#logout').disabled = true;
  try {
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) throw error;
    $('#submission-form').reset();
    sessionStorage.removeItem('student-evidence-import');
    await updateAccount(null);
  } catch (error) { notice(readableError(error), true); }
  finally { $('#logout').disabled = false; }
});
$('#submission-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!user || teacher) return;
  const version = generation, submittedForm = new FormData(event.currentTarget);
  const payload = Object.fromEntries(fields.map(key => [key, String(submittedForm.get(key) || '').trim()]));
  if (fields.filter(key => !['project','problem_solving'].includes(key)).some(key => !payload[key])) { notice('공백만 입력한 항목을 확인해 주세요.', true); return; }
  $('#submit-record').disabled = true;
  $('#submit-record').textContent = '제출 중…';
  try {
    const {error} = await client.from('student_submissions').insert(payload);
    if (error) throw error;
    if (version !== generation) return;
    $('#submission-form').reset(); page = 0;
    await loadHistory();
    notice('활동 기록이 제출되었습니다. 아래 내역에서 확인할 수 있습니다.');
  } catch (error) { if (version === generation) notice(readableError(error), true); }
  finally { $('#submit-record').disabled = false; $('#submit-record').textContent = '활동 기록 제출하기'; }
});
$('#refresh').addEventListener('click', () => void loadHistory());
$('#filter-form').addEventListener('submit', event => {event.preventDefault(); page = 0; void loadHistory();});
$('#previous').addEventListener('click', () => {if (page > 0) page--; void loadHistory();});
$('#next').addEventListener('click', () => {page++; void loadHistory();});

async function initialize() {
  try {
    const response = await fetch('/api/public-config');
    const config = await response.json();
    if (!response.ok) { notice(config.error || '제출함 연결을 확인해 주세요.', true); return; }
    const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2.117.3');
    client = createClient(config.url, config.publishableKey, {auth:{storage:sessionStorage,detectSessionInUrl:true}});
    client.auth.onAuthStateChange((_event, session) => {
      // Run DB queries outside the SDK auth callback lock.
      setTimeout(() => { void updateAccount(session).catch(() => notice('계정 확인에 실패했습니다. 다시 로그인해 주세요.', true)); }, 0);
    });
    $('#auth-fields').disabled = false;
  } catch { notice('제출함에 연결할 수 없습니다. 인터넷 연결 또는 서비스 설정을 확인해 주세요.', true); }
}
void initialize();
