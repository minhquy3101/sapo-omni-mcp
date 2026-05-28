import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer) {
  server.prompt(
    "analyze-sales",
    "Analyze sales performance for a time period",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Phân tích doanh thu và đơn hàng trong khoảng thời gian được chỉ định, bao gồm: tổng doanh thu, số đơn hàng, AOV, và top sản phẩm bán chạy.",
          },
        },
      ],
    })
  );
}
