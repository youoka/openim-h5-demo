<template>
  <van-popup v-model:show="visible" position="bottom" :style="{ height: '60%' }" round>
    <div class="custom-service-list">
      <div class="header">
        <div class="title">{{ $t('customServiceList') }}</div>
        <van-icon name="cross" @click="closePopup" class="close-icon" />
      </div>
      
      <div class="content">
        <van-loading v-if="loading" class="loading-container">
          <div>{{ $t('loading') }}</div>
        </van-loading>
        
        <van-empty v-else-if="!customServiceUsers || customServiceUsers.length === 0" :description="$t('noCustomService')" />
        
        <div v-else class="user-list">
          <van-cell 
            v-for="user in customServiceUsers" 
            :key="user.userID"
            @click="handleUserClick(user.userID)"
            class="user-item"
          >
            <template #title>
              <div class="user-info">
                <Avatar :src="user.faceURL" :text="user.nickname" />
                <div class="user-details">
                  <div class="nickname">{{ user.nickname }}</div>
                  <div class="user-id">{{ user.userID }}</div>
                </div>
              </div>
            </template>
          </van-cell>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { IMSDK } from '@/utils/imCommon'
import { feedbackToast } from '@/utils/common'
import useConversationStore from '@/store/modules/conversation'
import useUserStore from '@/store/modules/user'
import Avatar from '@/components/Avatar/index.vue'
import { SessionType } from '@openim/wasm-client-sdk'
import { searchUserInfoByBusiness, getBusinessInfo } from '@/api/user'

// 固定的客服用户ID列表，使用有效的用户ID
const CUSTOM_SERVICE_USER_IDS = [
  "5308100819",
  "4136859592",
  "3604454670",
]

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const router = useRouter()
const conversationStore = useConversationStore()
const userStore = useUserStore()

const loading = ref(false)
const customServiceUsers = ref<any[]>([])

// 创建一个计算属性来双向绑定
const visible = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

// 监听show属性变化，当弹窗打开时才加载数据
watch(() => props.show, (newVal) => {
  if (newVal) {
    fetchCustomServiceUsers()
  }
})

// 关闭弹窗的方法
const closePopup = () => {
  visible.value = false
}

const fetchCustomServiceUsers = async () => {
  console.log('准备获取客服信息，用户ID列表:', CUSTOM_SERVICE_USER_IDS)
  
  if (!CUSTOM_SERVICE_USER_IDS || CUSTOM_SERVICE_USER_IDS.length === 0) {
    customServiceUsers.value = []
    return
  }

  loading.value = true
  try {
    // 使用与搜索功能相同的方式获取用户信息
    const users = []
    for (const userId of CUSTOM_SERVICE_USER_IDS) {
      try {
        // 首先通过业务API搜索用户
        const {
          data: { users: businessUsers, total },
        } = await searchUserInfoByBusiness(userId)
        
        if (total > 0) {
          const businessData = businessUsers[0]
          // 然后通过IM SDK获取IM用户信息
          const { data } = await IMSDK.getUsersInfo([businessData.userID])
          const imData = data[0]
          const userInfo = {
            ...imData,
            ...businessData,
          }
          users.push(userInfo)
        } else {
          // 如果搜索不到，尝试直接通过IM SDK获取
          const { data } = await IMSDK.getUsersInfo([userId])
          if (data && data.length > 0) {
            // 同时获取业务信息
            try {
              const businessRes = await getBusinessInfo(userId)
              if (businessRes.data.users && businessRes.data.users.length > 0) {
                const userInfo = {
                  ...data[0],
                  ...businessRes.data.users[0]
                }
                users.push(userInfo)
              } else {
                users.push(data[0])
              }
            } catch (businessError) {
              console.warn(`获取用户 ${userId} 业务信息失败:`, businessError)
              users.push(data[0])
            }
          }
        }
      } catch (err) {
        console.warn(`获取用户 ${userId} 信息失败:`, err)
        // 如果业务搜索失败，尝试直接通过IM SDK获取
        try {
          const { data } = await IMSDK.getUsersInfo([userId])
          if (data && data.length > 0) {
            users.push(data[0])
          }
        } catch (imError) {
          console.warn(`直接获取用户 ${userId} IM信息失败:`, imError)
        }
      }
    }
    
    customServiceUsers.value = users
    console.log('最终客服用户列表:', customServiceUsers.value)
  } catch (error) {
    console.error('获取客服列表失败:', error)
    console.error('错误详情:', {
      userIds: CUSTOM_SERVICE_USER_IDS,
      errorMessage: error instanceof Error ? error.message : '未知错误',
      errorObject: error
    })
    
    // 降级处理：显示当前用户作为备选
    try {
      const currentUserId = userStore.storeSelfInfo?.userID
      if (currentUserId) {
        const fallbackResult = await IMSDK.getUsersInfo([currentUserId])
        if (fallbackResult && Array.isArray(fallbackResult.data)) {
          customServiceUsers.value = fallbackResult.data.filter(user => user && user.userID)
        } else {
          customServiceUsers.value = []
        }
      } else {
        customServiceUsers.value = []
      }
    } catch (fallbackError) {
      console.error('获取备选用户信息也失败了:', fallbackError)
      customServiceUsers.value = []
    }
    
    feedbackToast({ error, message: '获取客服列表失败' })
  } finally {
    loading.value = false
  }
}

const handleUserClick = async (userID: string) => {
  try {
    // 获取会话
    const conversation = (
      await IMSDK.getOneConversation({
        sourceID: userID,
        sessionType: SessionType.Single,
      })
    ).data

    // 更新当前会话
    await conversationStore.updateCurrentConversation(conversation)

    // 关闭模态框并跳转到聊天页面
    closePopup()
    router.push(`/chat?conversationID=${conversation.conversationID}`)
  } catch (error) {
    console.error('获取会话失败:', error)
    feedbackToast({ error, message: '获取会话失败' })
  }
}

// 移除了 onMounted 钩子，改为通过监听 show 属性触发加载

defineExpose({
  fetchCustomServiceUsers
})
</script>

<style lang="scss" scoped>
.custom-service-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #f0f0f0;
    
    .title {
      font-size: 18px;
      font-weight: 600;
    }
    
    .close-icon {
      font-size: 20px;
      color: #999;
    }
  }
  
  .content {
    flex: 1;
    overflow-y: auto;
    
    .loading-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
    
    .user-list {
      .user-item {
        padding: 12px 16px;
        
        .user-info {
          display: flex;
          align-items: center;
          
          .user-details {
            margin-left: 12px;
            
            .nickname {
              font-size: 16px;
              font-weight: 500;
              margin-bottom: 4px;
            }
            
            .user-id {
              font-size: 12px;
              color: #999;
            }
          }
        }
      }
    }
  }
}
</style>