import { ModulePlaceholder } from "@/components/ui";

export default function PublishTaskPage() {
  return (
    <ModulePlaceholder
      title="发布任务"
      description="跟踪单次发布的状态。未获得真实发布权限时，不会显示发布成功。"
      status="发布能力将在连接平台后启用。"
    />
  );
}
