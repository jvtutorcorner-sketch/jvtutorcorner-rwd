/**
 * 課程對齊驗證——詳細診斷腳本
 * 用途：檢查學生報名課程 vs 老師看到的課程之間的關係
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// 測試帳號
const STUDENT = {
  email: 'basic@test.com',
  password: '123456',
};

const TEACHER = {
  email: 'lin@test.com',
  password: '123456',
};

async function diagnoseAlignment() {
  console.log('='.repeat(80));
  console.log('課程對齊診斷開始');
  console.log('='.repeat(80));

  // STEP 1: 查詢學生的訂單
  console.log('\n📊 STEP 1: 查詢學生 ' + STUDENT.email + ' 的訂單');
  console.log('-'.repeat(80));
  const studentOrdersUrl = `${BASE_URL}/api/orders?userId=${encodeURIComponent(STUDENT.email)}&limit=50`;
  console.log('API: ' + studentOrdersUrl);
  
  let studentOrders = [];
  try {
    const res = await fetch(studentOrdersUrl);
    const data = await res.json();
    studentOrders = (data?.ok ? data.data : data) || [];
    console.log(`✅ 获取 ${studentOrders.length} 個訂單`);
    
    // 只顯示學生的訂單
    studentOrders.forEach(o => {
      console.log(`  - 訂單 ID: ${o.orderId}`);
      console.log(`    課程 ID: ${o.courseId}`);
      console.log(`    用戶: ${o.userId}`);
      console.log(`    開始時間: ${o.startTime || '(無)'}`);
      console.log(`    結束時間: ${o.endTime || '(無)'}`);
      console.log(`    狀態: ${o.status}`);
    });
  } catch (err) {
    console.error('❌ 獲取學生訂單失敗:', err.message);
    return;
  }

  if (studentOrders.length === 0) {
    console.log('❌ 學生沒有任何訂單，無法進行對齊驗證');
    return;
  }

  // STEP 2: 查詢每個學生訂單對應的課程詳情
  console.log('\n📚 STEP 2: 查詢學生訂單中的課程詳情');
  console.log('-'.repeat(80));
  
  const courseDetailsMap = {};
  for (const order of studentOrders) {
    const courseId = order.courseId;
    if (!courseId) continue;
    
    try {
      const res = await fetch(`${BASE_URL}/api/courses?id=${encodeURIComponent(courseId)}`);
      const data = await res.json();
      const course = data?.course || null;
      
      if (course) {
        courseDetailsMap[courseId] = course;
        console.log(`✅ 課程 ${courseId}:`);
        console.log(`  - 標題: ${course.title || '(無)'}`);
        console.log(`  - 教師: ${course.teacherName || course.teacher || '(無)'}`);
        console.log(`  - 教師 ID: ${course.teacherId || '(無)'}`);
        console.log(`  - 開始時間: ${course.startTime || '(無)'}`);
        console.log(`  - 結束時間: ${course.endTime || '(無)'}`);
      } else {
        console.log(`⚠️ 課程 ${courseId} 未找到主記錄`);
      }
    } catch (err) {
      console.error(`❌ 獲取課程 ${courseId} 失敗:`, err.message);
    }
  }

  // STEP 3: 查詢老師的課程
  console.log('\n👨‍🏫 STEP 3: 查詢老師 ' + TEACHER.email + ' 的課程');
  console.log('-'.repeat(80));
  
  // 先嘗試通過 teacherId 查詢
  // 模擬老師信息（實際上需要從登入時獲取）
  const teacherName = '林老師'; // 假設的教師名稱
  const teacherCourseUrl = `${BASE_URL}/api/courses?teacher=${encodeURIComponent(teacherName)}&limit=50`;
  console.log('API (通過教師名稱): ' + teacherCourseUrl);
  
  let teacherCourses = [];
  try {
    const res = await fetch(teacherCourseUrl);
    const data = await res.json();
    teacherCourses = (data?.ok ? data.data : data) || [];
    console.log(`✅ 获取 ${teacherCourses.length} 個課程`);
    
    teacherCourses.forEach(c => {
      console.log(`  - 課程 ID: ${c.id}`);
      console.log(`    標題: ${c.title || '(無)'}`);
      console.log(`    教師: ${c.teacherName || c.teacher || '(無)'}`);
      console.log(`    開始時間: ${c.startTime || '(無)'}`);
    });
  } catch (err) {
    console.error('❌ 獲取老師課程失敗:', err.message);
  }

  // STEP 4: 查詢老師對應課程的訂單
  console.log('\n📋 STEP 4: 查詢老師課程的訂單');
  console.log('-'.repeat(80));
  
  const teacherOrders = [];
  for (const course of teacherCourses) {
    try {
      const res = await fetch(`${BASE_URL}/api/orders?courseId=${encodeURIComponent(course.id)}&limit=50`);
      const data = await res.json();
      const orders = (data?.ok ? data.data : data) || [];
      
      console.log(`✅ 課程 ${course.id} (${course.title}): ${orders.length} 個訂單`);
      orders.forEach(o => {
        console.log(`  - 訂單 ID: ${o.orderId}, 用戶: ${o.userId}`);
      });
      
      teacherOrders.push(...orders);
    } catch (err) {
      console.error(`❌ 獲取課程 ${course.id} 的訂單失敗:`, err.message);
    }
  }

  // STEP 5: 交叉比對
  console.log('\n🔍 STEP 5: 交叉比對——尋找學生訂單是否出現在老師的課程中');
  console.log('-'.repeat(80));
  
  const studentOrderIds = new Set(studentOrders.map(o => o.orderId));
  const teacherOrderIds = new Set(teacherOrders.map(o => o.orderId));
  
  const commonOrders = [...studentOrderIds].filter(id => teacherOrderIds.has(id));
  const onlyInStudent = [...studentOrderIds].filter(id => !teacherOrderIds.has(id));
  const onlyInTeacher = [...teacherOrderIds].filter(id => !studentOrderIds.has(id));
  
  console.log(`✅ 同時出現在學生和老師的訂單: ${commonOrders.length}`);
  commonOrders.forEach(id => console.log(`  - ${id}`));
  
  console.log(`⚠️ 僅出現在學生的訂單（老師看不到）: ${onlyInStudent.length}`);
  onlyInStudent.forEach(id => console.log(`  - ${id}`));
  
  console.log(`ℹ️ 僅出現在老師的訂單（學生沒報名）: ${onlyInTeacher.length}`);
  onlyInTeacher.forEach(id => console.log(`  - ${id}`));

  // SUMMARY
  console.log('\n' + '='.repeat(80));
  console.log('📊 診斷結論');
  console.log('='.repeat(80));
  
  if (commonOrders.length > 0) {
    console.log('✅ 課程對齊成功: 學生報名的課程和老師看到的課程有對應關係');
  } else if (onlyInStudent.length > 0) {
    console.log('❌ 課程對齊失敗: 學生報名的課程，老師看不到');
    console.log('\n可能原因:');
    console.log('1. 學生報名的課程未被分配給該老師');
    console.log('2. 課程的 teacherId/teacherName 不匹配老師的信息');
    console.log('3. 訂單數據未正確同步到老師視圖');
  }
}

// 執行診斷
diagnoseAlignment().catch(err => {
  console.error('❌ 診斷過程出錯:', err);
  process.exit(1);
});
