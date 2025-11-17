<template>
  <div class="page_container relative !bg-white px-10">
    <img class="mx-auto mt-[80px] h-16 w-16" src="@assets/images/logo.png" alt="" />
    <div class="mx-auto text-lg font-semibold text-primary">{{ $t('welcome') }}</div>

    <van-form @submit="onSubmit" class="mt-[60px] flex-1">
      <div v-if="!isByEmail">
        <div class="mb-1 text-sm text-sub-text">{{ $t('cellphone') }}</div>
        <div class="flex items-center rounded-lg border border-gap-text">
          <div class="flex items-center border-r border-gap-text px-3" @click="showAreaCode = true">
            <span class="mr-1">{{ formData.areaCode }}</span>
            <van-icon name="arrow-down" />
          </div>
          <van-field class="!py-1 !text-base" clearable v-model="formData.phoneNumber" name="phoneNumber" type="number"
            :placeholder="$t('placeholder.inputPhoneNumber')" />
        </div>
      </div>

      <div v-else>
        <div class="mb-1 text-sm text-sub-text">{{ $t('email') }}</div>
        <div class="rounded-lg border border-gap-text">
          <van-field class="!py-1" clearable v-model="formData.email" name="email"
            :placeholder="$t('placeholder.inputEmail')" />
        </div>
      </div>

      <div class="mt-5" v-if="isByPassword">
        <div class="mb-1 text-sm text-sub-text">{{ $t('password') }}</div>
        <div class="rounded-lg border border-gap-text">
          <van-field class="!py-1" clearable v-model="formData.password" name="password" type="password"
            :placeholder="$t('placeholder.inputPassword')" />
        </div>
      </div>

      <div class="mt-5" v-else>
        <div class="mb-1 text-sm text-sub-text">{{ $t('reAcquireDesc') }}</div>
        <div class="rounded-lg border border-gap-text">
          <van-field class="!py-1" clearable v-model="formData.verificationCode" name="verificationCode" type="text"
            :placeholder="$t('placeholder.inputVerificationCode')">
            <template #button>
              <span class="text-primary" @click="reSend" v-if="count <= 0">{{
                $t('buttons.verificationCode')
                }}</span>
              <span class="text-primary" v-else>{{ count }}S</span>
            </template>
          </van-field>
        </div>
      </div>

      <div class="mt-3 flex justify-between">
        <div class="text-xs text-sub-text" @click="getCode(false)">
          {{ $t('forgetPasswordTitle') }}
        </div>
        <div class="text-xs text-primary" @click="isByPassword = !isByPassword">
          {{
            `${isByPassword ? $t('buttons.verificationCodeLogin') : $t('buttons.passwordLogin')}`
          }}
        </div>
      </div>

      <div class="mt-16">
        <van-button :loading="loading" :disabled="!(
            (formData.phoneNumber || formData.email) &&
            (formData.password || formData.verificationCode)
          )
          " block type="primary" native-type="submit">
          {{ $t('buttons.login') }}
        </van-button>

        <div class="my-4 h-[1px] w-full bg-[#707070] opacity-10"></div>

        <van-button @click="isByEmail = !isByEmail" block>
          {{ isByEmail ? $t('buttons.phoneNumberLogin') : $t('buttons.emailLogin') }}
        </van-button>
      </div>
    </van-form>

    <div class="mb-[32px] flex w-[300px] flex-col items-center text-xs">
      <div class="flex flex-row text-primary">
        <div class="text-sub-text">{{ $t('notHaveAccount') }}</div>
        <div @click="getCode(true)">{{ $t('nowRegister') }}</div>
      </div>
      <div class="text-sub-text">{{ version }}</div>
    </div>

    <van-popup v-model:show="showAreaCode" round position="bottom">
      <van-picker :columns="countryCode" @cancel="showAreaCode = false" @confirm="onConfirmAreaCode"
        :columns-field-names="{
          text: 'phone_code',
          value: 'phone_code',
          children: 'children',
        }" />
    </van-popup>

    <van-action-sheet v-model:show="showActions" :actions="actions" @select="onSelect" />
  </div>
</template>

<script setup lang="ts">
import md5 from 'md5'
import type { PickerConfirmEventParams } from 'vant'
import { login, sendSms } from '@/api/login'
import countryCode from '@/utils/areaCode'
import { feedbackToast } from '@/utils/common'
import { setIMProfile } from '@/utils/storage'
import { UsedFor } from '@/api/data'

const version = process.env.VERSION

const { t } = useI18n()
const router = useRouter()
const showActions = ref(false)
const isRegiste = ref(false)
const actions = ref<{ idx: number; name: string }[]>([])

const formData = reactive({
  phoneNumber: localStorage.getItem('IMAccount') ?? '',
  email: '',
  areaCode: '+86',
  password: '',
  verificationCode: '',
  accept: true,
})
const loading = ref(false)
const isByPassword = ref(true)
const isByEmail = ref(false)
const showAreaCode = ref(false)
const count = ref(0)
let timer: NodeJS.Timer

// 添加自动登录逻辑，在组件挂载时执行
onMounted(() => {
  console.log('检查自动登录参数...');
  
  console.log('window.location:', window.location);
  console.log('window.location.search:', window.location.search);
  console.log('window.location.hash:', window.location.hash);
  
  // 检查URL参数中的自动登录信息
  // 首先检查标准查询参数（非hash路由）
  // 处理URL中的转义字符
  let search = window.location.search;
  if (search.includes('\\u0026')) {
    // 处理双重转义的情况
    search = search.replace(/\\u0026/g, '&');
  } else if (search.includes('\u0026')) {
    // 处理单重转义的情况
    search = search.replace(/\u0026/g, '&');
  }
  
  const urlParams = new URLSearchParams(search);
  let IM_CHAT_TOKEN = urlParams.get("chatToken");
  let IM_TOKEN = urlParams.get("imToken");
  let IM_USERID = urlParams.get("uid");
  
  console.log('查询参数解析结果:', {IM_CHAT_TOKEN, IM_TOKEN, IM_USERID});

  // 如果标准查询参数中没有找到，则检查hash路由参数
  if ((!IM_CHAT_TOKEN || !IM_TOKEN || !IM_USERID) && window.location.hash.includes('?')) {
    let hash = window.location.hash.split('?')[1];
    if (hash) {
      if (hash.includes('\\u0026')) {
        // 处理双重转义的情况
        hash = hash.replace(/\\u0026/g, '&');
      } else if (hash.includes('\u0026')) {
        // 处理单重转义的情况
        hash = hash.replace(/\u0026/g, '&');
      }
      
      const hashParams = new URLSearchParams(hash);
      IM_CHAT_TOKEN = hashParams.get("chatToken") || IM_CHAT_TOKEN;
      IM_TOKEN = hashParams.get("imToken") || IM_TOKEN;
      IM_USERID = hashParams.get("uid") || IM_USERID;
      console.log('Hash参数解析结果:', {IM_CHAT_TOKEN, IM_TOKEN, IM_USERID});
    }
  }

  // 如果找到了所有必需的参数，则自动登录
  if (IM_CHAT_TOKEN && IM_TOKEN && IM_USERID) {
    console.log('自动登录参数:', {IM_CHAT_TOKEN, IM_TOKEN, IM_USERID});
    setIMProfile({ chatToken: IM_CHAT_TOKEN, imToken: IM_TOKEN, userID: IM_USERID });
    
    // 使用nextTick确保DOM更新后再进行跳转
    nextTick(() => {
      router.push('/conversation').catch((error) => {
        console.error('自动登录跳转失败:', error);
        feedbackToast({ 
          message: t('messageTip.loginFailed'), 
          error: new Error('自动登录失败，请手动登录') 
        });
      });
    });
  } else {
    console.log('缺少必要的自动登录参数');
  }
})

const onSubmit = async () => {
  loading.value = true
  localStorage.setItem('IMAccount', formData.phoneNumber)
  try {
    const {
      data: { chatToken, imToken, userID },
    } = await login({
      phoneNumber: isByEmail.value ? '' : formData.phoneNumber,
      password: isByPassword.value ? md5(formData.password) : '',
      areaCode: formData.areaCode,
      verifyCode: formData.verificationCode,
      email: formData.email,
    })

    setIMProfile({ chatToken, imToken, userID })
    router.push('/conversation')
  } catch (error) {
    feedbackToast({ message: t('messageTip.loginFailed'), error })
  }
  loading.value = false
}

const onConfirmAreaCode = ({ selectedValues }: PickerConfirmEventParams) => {
  formData.areaCode = String(selectedValues[0])
  showAreaCode.value = false
}

const reSend = () => {
  if (count.value > 0) return
  sendSms({
    phoneNumber: formData.phoneNumber,
    areaCode: formData.areaCode,
    email: formData.email,
    usedFor: UsedFor.Login,
  }).then(startTimer)
  // .catch(error => feedbackToast({ message: t('messageTip.sendCodeFailed'), error }))
}

const startTimer = () => {
  if (timer) {
    clearInterval(timer)
  }
  count.value = 60
  timer = setInterval(() => {
    if (count.value > 0) {
      count.value -= 1
    } else {
      clearInterval(timer)
    }
  }, 1000)
}

const getCode = (flag: boolean) => {
  isRegiste.value = flag
  if (flag) {
    actions.value = [
      { idx: 0, name: t('buttons.emailRegiste') },
      { idx: 1, name: t('buttons.phoneNumberRegiste') },
    ]
  } else {
    actions.value = [
      { idx: 0, name: t('buttons.emailRetrieve') },
      { idx: 1, name: t('buttons.phoneNumberRetrieve') },
    ]
  }
  showActions.value = true
}

const onSelect = (item: { idx: number; name: string }) => {
  router.push({
    path: 'getCode',
    query: {
      isRegiste: isRegiste.value + '',
      isByEmail: item.idx === 0 ? true + '' : false + '',
    },
  })
}
</script>

<style lang="scss" scoped>
.page_container {
  background: linear-gradient(180deg,
      rgba(0, 137, 255, 0.1) 0%,
      rgba(255, 255, 255, 0) 100%);
}
</style>
