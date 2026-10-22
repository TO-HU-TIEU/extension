/* Shared deterministic checks for low-quality, canned or invented reactions. */
(() => {
  const CANNED_PATTERNS = [
    /\bchuẩn\s*bài\b/iu,
    /\bđúng\s*bài\b/iu,
    /(?:quá\s+hợp\s+lý\s+rồi|hợp\s+lý\s+luôn|bắt\s+cơm\s+phải\s+biết)/iu,
    /(?:hợp\s+lý\s+quá|quá\s+hợp\s+lý|(?:ngon|hay|đỉnh|cuốn|xịn|chất)\s+luôn|quá\s+(?:đỉnh|ngon|hay)|thật\s+sự\s+đấy|đúng\s+là\s+vậy\s+đấy|cuốn\s+phết|cuốn\s+hút\s+quá|nhìn\s+cuốn\s+thật(?:\s+đấy)?|trông\s+hấp\s+dẫn\s+thật|hấp\s+dẫn\s+không\s+chịu\s+nổi|ngon\s+mắt\s+thật\s+đấy|nhìn\s+ngon\s+thật\s+đấy|trông\s+ngon\s+không\s+chịu\s+nổi|nhìn\s+là\s+bắt\s+cơm|chắc\s+chắn\s+phải\s+ăn|phải\s+thử\s+một\s+lần)/iu,
    /(?:^|[\s,])thật\s+đấy\s*[.!?…]*$/iu,
    /(?:cảm\s+ơn.{0,60}(?:chia\s+sẻ|đăng\s+bài)|(?:chắc\s+là|chắc\s+chắn\s+là|có\s+lẽ\s+là|nhìn\s+chắc\s+là)\s+.{1,70}\s+lắm)/iu,
    /(?:quá\s+(?:tuyệt\s+vời|chất|xịn|ấn\s+tượng)|đúng\s+là\s+(?:chất\s+lượng|chuyên\s+nghiệp|tâm\s+huyết|chất)|đúng\s+bài\s+luôn|chuẩn\s+luôn|không\s+thể\s+(?:tin\s+nổi|nào\s+hay\s+hơn)|không\s+còn\s+gì\s+để\s+chê|không\s+sai\s+một\s+ly\s+nào|chính\s+xác\s+quá|rất\s+đúng|tuyệt\s+đối\s+không\s+thể\s+bỏ\s+qua|nhìn\s+phát\s+mê|nhìn\s+là\s+muốn\s+ăn\s+luôn|trông\s+(?:xịn|ngon\s+mắt)\s+quá|chắc\s+phải\s+(?:order|thử)|chắc\s+chắn\s+ngon|mình\s+sẽ\s+thử\s+ngay|sẽ\s+áp\s+dụng\s+thử|phải\s+thử\s+(?:cho\s+biết|một\s+lần)|đáng\s+đồng\s+tiền\s+bát\s+gạo|bài\s+viết\s+rất\s+hay|nội\s+dung\s+chất\s+lượng\s+cao|rất\s+ấn\s+tượng|rất\s+đáng\s+(?:xem|đọc)|mình\s+học\s+được\s+nhiều|cảm\s+ơn\s+nhiều|cảm\s+ơn\s+vì\s+chia\s+sẻ|vượt\s+(?:quá\s+)?mong\s+đợi|ấn\s+tượng\s+đầu\s+tiên\s+rất\s+tốt|không\s+ngờ\s+lại\s+hay\s+đến\s+vậy|siêu\s+phẩm|cực\s+phẩm|đỉnh\s+thật|đỉnh\s+cao\s+nghệ\s+thuật|hay\s+không\s+tưởng|cuốn\s+không\s+chịu\s+được|hấp\s+dẫn\s+thật\s+sự|ngon\s+tuyệt\s+cú\s+mèo|thèm\s+quá\s+đi|hay\s+quá\s+trời|xịn\s+sò|đúng\s+chuẩn|chất\s+thật|hay\s+thật|ngon\s+tuyệt|cuốn\s+thật|thèm\s+quá|ấn\s+tượng\s+quá|hữu\s+ích\s+quá)/iu,
    /(?:ngon|hay|cuốn|thèm|ấn\s+tượng)\s+quá\s+đi(?:\s+mất)?|(?:ngon|hay|cuốn|hợp\s+lý)\s+quá\s+trời(?:\s+luôn)?|(?:thèm|cuốn)\s+không\s+chịu\s+được|ngon\s+không\s+chịu\s+nổi/iu,
    /(?:công\s+nhận(?:\s+là)?\s+(?:ngon|hay|đỉnh)|phải\s+(?:công\s+nhận|thừa\s+nhận)|không\s+thể\s+(?:phủ\s+nhận|chối\s+cãi)|rõ\s+ràng\s+là\s+(?:ngon|hay)|không\s+chê\s+(?:được|nổi)|khó\s+mà\s+chê\s+được|không\s+có\s+điểm\s+trừ|không\s+(?:cần|phải)\s+nói\s+nhiều|khen\s+không\s+hết\s+lời|mô\s+tả\s+không\s+hết)/iu,
    /(?:mình\s+sẽ\s+lưu\s+lại|sẽ\s+lưu\s+để\s+xem\s+sau|mình\s+sẽ\s+thử\s+áp\s+dụng|sẽ\s+theo\s+dõi(?:\s+kênh)?|đáng\s+để\s+theo\s+dõi|sẽ\s+ủng\s+hộ|bài\s+viết\s+rất\s+chi\s+tiết|giải\s+thích\s+rất\s+dễ\s+hiểu|chia\s+sẻ\s+rất\s+thực\s+tế|nội\s+dung\s+rất\s+sát\s+thực\s+tế|kinh\s+nghiệm\s+quý\s+giá|chia\s+sẻ\s+chân\s+thành|rất\s+bổ\s+ích|áp\s+dụng\s+được\s+ngay|chuẩn\s+không\s+cần\s+chỉnh|xịn\s+không\s+cần\s+bàn|ngon\s+không\s+cần\s+nói|đỉnh\s+không\s+cần\s+chỉnh|đúng\s+như\s+mình\s+nghĩ|mình\s+cũng\s+nghĩ\s+vậy)/iu,
    /(?:bắt\s+mắt\s+thật|trông\s+bắt\s+mắt|nhìn\s+bắt\s+mắt\s+quá|(?:đồ\s+ăn|món\s+ăn)\s+(?:bắt\s+mắt|đẹp\s+mắt)|trình\s+bày\s+đẹp|bày\s+biện\s+đẹp|(?:hình\s+ảnh|ảnh)\s+rất\s+đẹp|góc\s+chụp\s+đẹp|mình\s+bất\s+ngờ\s+quá|không\s+ngờ\s+lại\s+ngon\s+đến\s+vậy|ấn\s+tượng\s+hơn\s+mong\s+đợi|ngon\s+thật\s+sự|hay\s+thật\s+sự|đúng\s+thật\s+sự|thật\s+sự\s+(?:ấn\s+tượng|hữu\s+ích)|nói\s+thật\s+là|thật\s+lòng\s+thì|cảm\s+giác\s+là\s+ngon|cảm\s+thấy\s+thèm|mình\s+thấy\s+ngon|theo\s+mình\s+thì\s+hay|cá\s+nhân\s+mình\s+thấy|đánh\s+giá\s+rất\s+cao|10\s*\/\s*10|full\s+điểm)/iu,
    /\bhết\s*sảy\b/iu,
    /\băn\s+(?:là\s+)?ghiền\b/iu,
    /\b(?:nhìn|trông)\s+(?:mà\s+)?(?:ngon|hấp\s+dẫn|cuốn|ngon\s+mắt)(?:\s+(?:thật(?:\s+đấy)?|phết|quá|luôn|không\s+chịu\s+nổi))?\b/iu,
    /\b(?:đỉnh\s+của\s+chóp|đỉnh\s+cao|siêu\s+(?:ngon|hay|ấn\s+tượng)|ngon\s+tuyệt\s+đối|tuyệt\s+vời\s+quá|xịn\s+quá|quá\s+đỉnh|wow\s+quá)\b/iu,
    /\b(?:thế\s+này|như\s+này)\s+thì\s+(?:deadline|ngày\s+mới|cuộc\s+sống).{0,60}(?:nể|phải\s+nhường|không\s+thể|cũng\s+phải)\b/iu,
    /\b(?:chưa\s+kịp|chưa\s+đến)\s+(?:tới\s+)?(?:cà\s+phê|coffee).{0,60}(?:đã|mà).{0,60}(?:nhận\s+ca|nạp\s+năng\s+lượng|mở\s+tiệc|deadline)\b/iu,
    /\b(?:nạp\s+năng\s+lượng|mở\s+tiệc).{0,60}(?:deadline|trước\s+deadline)\b/iu,
    /\b(?:nhìn\s+phát\s+thèm|nhìn\s+thôi\s+đã\s+thấy\s+ngon|nhìn\s+là\s+muốn\s+ăn|thèm\s+nhỏ\s+dãi|nhìn\s+mà\s+thèm)\b/iu,
    /(?:thì\s+hết\s+ý|thật\s+sự\s+luôn|bắt\s+mắt\s+quá|là\s+chuẩn|như\s+thế\s+này\s+quá\s+tuyệt\s+vời|đi\s+kèm\s+nhìn\s+cũng\s+rất\s+hấp\s+dẫn|đủ\s+năng\s+lượng\s+cho\s+một\s+buổi\s+sáng\s+bận\s+rộn(?:\s+rồi)?|đủ\s+tỉnh\s+táo|thì\s+còn\s+gì\s+bằng)/iu,
    /là\s+thấy.{0,70}rồi/iu,
    /\b(?:chắc\s+(?:phải\s+)?thử\s+(?:một\s+lần|cho\s+biết)|chắc\s+chắn\s+sẽ\s+(?:order|đặt|thử|áp\s+dụng)|phải\s+thử\s+một\s+lần\s+cho\s+biết)\b/iu,
    /\b(?:không\s+thể\s+(?:cưỡng\s+lại|bỏ\s+qua)|ngon\s+đến\s+mức\s+không\s+nói\s+nên\s+lời|đúng\s+là\s+món\s+đáng\s+thử|ngon\s+tuyệt\s+đối|đỉnh\s+của\s+chóp)\b/iu,
    /\b(?:bài\s+viết|nội\s+dung)\s+(?:rất\s+|cực\s+kỳ\s+|quá\s+)?(?:hữu\s+ích|chất\s+lượng|ấn\s+tượng|tâm\s+huyết)\b/iu,
    /\b(?:cảm\s+ơn)(?:\s+bạn)?\s+(?:đã\s+)?chia\s+sẻ(?:\s+(?:thông\s+tin\s+)?(?:bổ\s+ích|kiến\s+thức\s+quý\s+giá))?\b/iu,
    /\b(?:mình\s+học\s+được\s+nhiều\s+điều|mình\s+sẽ\s+áp\s+dụng\s+ngay|rất\s+đáng\s+để\s+đọc|không\s+thể\s+bỏ\s+qua|mình\s+đồng\s+ý\s+hoàn\s+toàn|không\s+sai\s+chút\s+nào|đúng\s+là\s+chuyên\s+nghiệp|đúng\s+là\s+bài\s+viết\s+tâm\s+huyết)\b/iu,
    /\b(?:đỉnh\s+cao|tuyệt\s+đối|không\s+thể\s+tin\s+được|ấn\s+tượng\s+mạnh|xuất\s+sắc|hoàn\s+hảo|quá\s+đỉnh|wow\s+quá|tuyệt\s+vời\s+thật\s+sự)\b/iu,
    /\b(?:hay\s+quá\s+bạn\s+ơi|hay\s+thật\s+đấy|quá\s+hay\s+luôn|chính\s+xác\s+luôn|rất\s+đúng|cảm\s+ơn\s+nhiều\s+nhé|cảm\s+ơn\s+đã\s+chia\s+sẻ)\b/iu,
    /\bhao\s*cơm\b/iu,
    /\btỉnh\s+táo\s+(?:làm\s+việc\s+)?cả\s+ngày\b/iu,
    /\blạ\s+miệng\s+thật\s+đấy\b/iu,
    /\bdẻo\s+thơm\s+mà\s+lại\s+giòn\s+r(?:ụ|u)m\s+luôn\b/iu,
    /\bthèm\s+thêm\s+lần\s+nữa\b/iu,
    /\bmọi\s+người\s+thấy\s+sao\s+về\s+điều\s+này\b/iu,
    /\bbạn\s+đã\s+thử\s+chưa\s+hay\s+lại\s+tiếc\s+hùi\s+hụi\b/iu,
    /\bđoạn\s+này\s+nhìn\s+cuốn\s+ghê\b/iu,
    /\bbất\s+lực\s+thực\s+sự\b/iu,
    /\bnhìn\s+thôi\s+đã\s+thèm\b/iu,
    /\băn\s+ngon\s+ngủ\s+kỹ\b/iu,
    /\bngon\s+nhức\s+nách\b/iu,
  ];
  const GENERIC_QUESTIONS = [
    /^(?:mọi\s+người|các\s+bạn)\s+thấy\s+sao\s+(?:về|với)\s+(?:điều\s+này|bài\s+này|chuyện\s+này)[?!.…\s]*$/iu,
    /^(?:bạn|mọi\s+người)\s+đã\s+thử\s+chưa[?!.…\s]*$/iu,
  ];
  const UNSUPPORTED_EXPERIENCE =
    /\b(?:mình|tôi|tui|tao)\s+(?:(?:sáng\s+nay|hôm\s+nay|hôm\s+qua)\s+)?(?:(?:đã|vừa|mới)\s+)?(?:ăn|uống|thử|mua|dùng|đi|xem)(?:\s+[^,.!?…]{1,50})?\s+(?:rồi|xong|đã)\b/iu;
  const GENERIC_REACTIONS =
    /^(?:bất\s+lực\s+thực\s+sự|nhìn\s+thôi\s+đã\s+thèm|đoạn\s+này\s+nhìn\s+cuốn\s+ghê|nhìn\s+cuốn\s+ghê|hay\s+quá\s+bạn\s+ơi|tuyệt\s+vời\s+quá|xịn\s+quá|siêu\s+\w+\s+luôn|ăn\s+là\s+ghiền(?:\s+luôn)?|không\s+còn\s+gì\s+để\s+chê)[.!?…\s]*$/iu;
  const OBVIOUS_RESTATEMENT =
    /(?:ai\s+(?:chả|cũng)\s+biết(?:\s+là)?|đương\s+nhiên\s+là|rõ\s+ràng\s+là|không\s+cần\s+nói\s+cũng\s+biết(?:\s+là)?|ai\s+cũng\s+hiểu(?:\s+là)?|chắc\s+ai\s+cũng\s+biết|điều\s+này\s+ai\s+cũng\s+rõ|không\s+có\s+gì\s+mới\s+cả|đúng\s+như\s+mọi\s+người\s+vẫn\s+nghĩ)/iu;
  const TAUTOLOGICAL_CLAIM =
    /(?:món\s+này\s+nhìn\s+ngon\s+thì\s+chắc\s+chắn\s+sẽ\s+ngon|món\s+ngon\s+thì\s+ai\s+cũng\s+thích|đồ\s+ăn\s+đẹp\s+mắt\s+thì\s+ai\s+cũng\s+muốn\s+ăn|nhìn\s+hấp\s+dẫn\s+thì\s+dễ\s+thèm|ăn\s+ngon\s+thì\s+sẽ\s+ngon\s+miệng|cơm\s+nóng\s+thì\s+ăn\s+mới\s+ngon|đồ\s+ăn\s+tươi\s+thì\s+luôn\s+ngon\s+hơn|món\s+cay\s+thì\s+sẽ\s+cay|đồ\s+chiên\s+thì\s+giòn|món\s+nước\s+thì\s+dễ\s+ăn|bài\s+viết\s+hay\s+thì\s+ai\s+cũng\s+(?:thích\s+đọc|muốn\s+đọc)|nội\s+dung\s+hữu\s+ích\s+thì\s+sẽ\s+hữu\s+ích|chia\s+sẻ\s+kiến\s+thức\s+thì\s+sẽ\s+giúp\s+ích|video\s+hay\s+thì\s+ai\s+cũng\s+muốn\s+xem|giải\s+thích\s+rõ\s+thì\s+dễ\s+hiểu|thông\s+tin\s+chính\s+xác\s+thì\s+đáng\s+tin|kinh\s+nghiệm\s+thật\s+thì\s+có\s+giá\s+trị|bài\s+viết\s+chi\s+tiết\s+thì\s+chi\s+tiết|nội\s+dung\s+chất\s+lượng\s+thì\s+chất\s+lượng|chia\s+sẻ\s+thật\s+lòng\s+thì\s+chân\s+thành|làm\s+tốt\s+thì\s+sẽ\s+tốt|cố\s+gắng\s+thì\s+sẽ\s+có\s+kết\s+quả|kiên\s+trì\s+thì\s+(?:sẽ\s+)?(?:thành\s+công|đạt\s+được\s+mục\s+tiêu)|học\s+hỏi\s+thì\s+sẽ\s+tiến\s+bộ|chia\s+sẻ\s+thì\s+sẽ\s+có\s+người\s+quan\s+tâm|làm\s+đúng\s+thì\s+sẽ\s+đúng|nói\s+thật\s+thì\s+sẽ\s+thật|quan\s+tâm\s+thì\s+sẽ\s+được\s+quan\s+tâm|tử\s+tế\s+thì\s+sẽ\s+được\s+đáp\s+lại|làm\s+việc\s+chăm\s+chỉ\s+thì\s+sẽ\s+có\s+thành\s+quả|làm\s+tốt\s+thì\s+sẽ\s+được\s+khen|chia\s+sẻ\s+thật\s+thì\s+sẽ\s+được\s+ủng\s+hộ|làm\s+việc\s+nghiêm\s+túc\s+thì\s+sẽ\s+có\s+kết\s+quả\s+tốt)/iu;
  const FOOD_PAIRING =
    /(?:ăn|dùng|chấm|gọi\s+thêm).{0,35}(?:rau\s+răm|bánh\s+mì(?:\s+chấm)?)|(?:rau\s+răm|bánh\s+mì(?:\s+chấm)?).{0,35}(?:ăn|dùng|chấm|hợp|ngon|tuyệt|chuẩn)/iu;
  const OBVIOUS_CAUSALITY =
    /(?:cố\s+gắng\s+thì\s+sẽ\s+thành\s+công|học\s+hỏi\s+từ\s+người\s+khác\s+thì\s+sẽ\s+tiến\s+bộ|quan\s+tâm\s+đến\s+người\s+khác\s+thì\s+sẽ\s+được\s+yêu\s+quý)/iu;

  const classify = (text, context = "") => {
    const value = String(text || "").trim();
    if (CANNED_PATTERNS.some((pattern) => pattern.test(value))) return "canned_phrase";
    if (OBVIOUS_RESTATEMENT.test(value)) return "obvious_restatement";
    if (TAUTOLOGICAL_CLAIM.test(value)) return "obvious_restatement";
    if (OBVIOUS_CAUSALITY.test(value)) return "obvious_restatement";
    if (FOOD_PAIRING.test(value)) {
      const source = String(context || "").toLocaleLowerCase();
      const mentionedPairing = /rau\s+răm|bánh\s+mì(?:\s+chấm)?/iu.exec(value)?.[0];
      if (mentionedPairing && !source.includes(mentionedPairing.toLocaleLowerCase()))
        return "unsupported_food_pairing";
    }
    if (GENERIC_QUESTIONS.some((pattern) => pattern.test(value))) return "generic_question";
    if (GENERIC_REACTIONS.test(value)) return "generic_reaction";
    if (UNSUPPORTED_EXPERIENCE.test(value)) return "unsupported_personal_experience";
    return "";
  };

  globalThis.X_REPLY_QUALITY = Object.freeze({ classify });
})();
