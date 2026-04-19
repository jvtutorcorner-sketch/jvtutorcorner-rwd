#!/bin/bash

# Test Data Cleanup Script

BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"
ADMIN_EMAIL="${QA_ADMIN_EMAIL:-admin@jvtutorcorner.com}"

echo "═══════════════════════════════════════════════════════"
echo "🧹 TEST DATA CLEANUP"
echo "═══════════════════════════════════════════════════════"
echo "Base URL: $BASE_URL"
echo ""

# Step 1: Delete stress test courses
echo "🎯 Step 1: Deleting stress test courses..."

for pattern in "stress-group-" "E2E 自動驗證課程-"; do
  echo "   🔍 Searching for courses with pattern: \"$pattern\""
  
  # Try a few common course IDs
  for i in 0 1 2; do
    courseId="stress-group-$i-"
    
    response=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/api/courses?id=$courseId" 2>/dev/null)
    http_code=$(echo "$response" | tail -1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
      echo "   ✅ Deleted course: $courseId"
    elif [ "$http_code" = "404" ]; then
      echo "   ℹ️ Course not found: $courseId (already deleted)"
    fi
  done
done

# Step 2: Delete test orders
echo ""
echo "🎯 Step 2: Deleting test orders..."

for i in 0 1 2; do
  courseId="stress-group-$i-"
  
  response=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/api/orders?courseId=$courseId" 2>/dev/null)
  http_code=$(echo "$response" | tail -1)
  
  if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
    echo "   ✅ Deleted orders for: $courseId"
  fi
done

# Step 3: Delete test teacher profiles
echo ""
echo "🎯 Step 3: Deleting test teacher profiles..."

for i in 0 1 2; do
  email="group-$i-teacher@test.com"
  
  response=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/api/profiles?email=$email" 2>/dev/null)
  http_code=$(echo "$response" | tail -1)
  
  if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
    echo "   ✅ Deleted profile: $email"
  elif [ "$http_code" = "404" ]; then
    echo "   ℹ️ Profile not found: $email (already deleted)"
  fi
done

echo ""
echo "✅ Cleanup process completed"
echo "═══════════════════════════════════════════════════════"
echo ""
