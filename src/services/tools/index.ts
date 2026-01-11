/**
 * 工具流处理服务模块
 * 
 * 提供统一的工具调用事件处理和格式化功能
 * 
 * @example
 * ```typescript
 * import { ToolStreamProcessorService } from '../../services/tools';
 * 
 * constructor(
 *   private toolStreamProcessor: ToolStreamProcessorService
 * ) {}
 * 
 * // 启动流式处理
 * this.toolStreamProcessor.startAgentStream(request, config)
 *   .subscribe(event => this.renderUIEvent(event, aiMessage));
 * ```
 */

// 类型定义
export * from './types/ui-stream-event.types';

// 服务
export * from './tool-output-formatter.service';
export * from './tool-stream-processor.service';
