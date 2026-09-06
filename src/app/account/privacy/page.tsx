import { BackLink } from "@/components/ui/hierarchy";

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[820px] px-[var(--nexa-page-pad-x)] py-10">
      <BackLink href="/account">← 返回账户</BackLink>
      <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-zinc-900">
        数据与隐私
      </h1>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-zinc-500">
        Nexa 不会要求你填写第三方 API Key。平台连接仅通过官方 OAuth。
      </p>

      <div className="mt-8 space-y-6 text-[14px] leading-relaxed text-zinc-700">
        <section>
          <h2 className="text-[15px] font-medium text-zinc-900">访客</h2>
          <p className="mt-2 text-zinc-600">
            可以搜索、查看真实结果、使用临时工作区，并体验 Commerce Demo
            Store。演示经营数据不会被当作已连接的真实店铺。
          </p>
        </section>
        <section>
          <h2 className="text-[15px] font-medium text-zinc-900">登录后</h2>
          <p className="mt-2 text-zinc-600">
            可长期保存工作区与素材、使用高成本生成、发布内容，以及连接内容平台。V1
            登录方式为 Email 与 Google。
          </p>
        </section>
        <section>
          <h2 className="text-[15px] font-medium text-zinc-900">AI Credits</h2>
          <p className="mt-2 text-zinc-600">
            消耗以 AI Credits 记账，流水可追踪。界面不展示 Token。模型成本由后台统一计算，不与某个模型在前端直接绑定。
          </p>
        </section>
      </div>
    </div>
  );
}
