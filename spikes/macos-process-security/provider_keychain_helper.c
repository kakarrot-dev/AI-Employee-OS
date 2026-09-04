#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_CREDENTIAL_BYTES 8192

static const char *service_for_provider(const char *provider) {
    if (strcmp(provider, "deepseek") == 0) return "com.kakarrot.ai-employee-os.credentials.v2";
    if (strcmp(provider, "poe") == 0) return "com.kakarrot.ai-employee-os.poe.credentials.v1";
    if (strcmp(provider, "feishu") == 0) return "com.kakarrot.ai-employee-os.feishu.credentials.v1";
    if (strcmp(provider, "test") == 0) return "com.kakarrot.ai-employee-os.provider-keychain-test";
    return NULL;
}

static const char *account_for_provider(const char *provider) {
    if (strcmp(provider, "deepseek") == 0) return "deepseek-api-key";
    if (strcmp(provider, "poe") == 0) return "poe-api-key";
    if (strcmp(provider, "feishu") == 0) return "feishu-oauth-credential";
    if (strcmp(provider, "test") == 0) return "provider-keychain-test";
    return NULL;
}

static CFMutableDictionaryRef base_query(const char *service_name, const char *account_name) {
    CFStringRef service = CFStringCreateWithCString(kCFAllocatorDefault, service_name, kCFStringEncodingUTF8);
    CFStringRef account = CFStringCreateWithCString(kCFAllocatorDefault, account_name, kCFStringEncodingUTF8);
    if (service == NULL || account == NULL) { if (service != NULL) CFRelease(service); if (account != NULL) CFRelease(account); return NULL; }
    CFMutableDictionaryRef query = CFDictionaryCreateMutable(kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    if (query == NULL) { CFRelease(service); return NULL; }
    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(query, kSecAttrService, service);
    CFDictionarySetValue(query, kSecAttrAccount, account);
    CFRelease(service);
    CFRelease(account);
    return query;
}

static int read_item(const char *service_name, const char *account_name) {
    CFMutableDictionaryRef query = base_query(service_name, account_name);
    if (query == NULL) return 70;
    CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
    CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching(query, &result);
    CFRelease(query);
    if (status == errSecItemNotFound) return 44;
    if (status != errSecSuccess || result == NULL || CFGetTypeID(result) != CFDataGetTypeID()) {
        if (result != NULL) CFRelease(result);
        fprintf(stderr, "keychain_read_failed:%d\n", (int)status);
        return 4;
    }
    CFDataRef data = (CFDataRef)result;
    CFIndex length = CFDataGetLength(data);
    if (length < 1 || length > MAX_CREDENTIAL_BYTES || fwrite(CFDataGetBytePtr(data), 1, (size_t)length, stdout) != (size_t)length) {
        CFRelease(result);
        return 3;
    }
    CFRelease(result);
    return 0;
}

static int item_exists(const char *service_name, const char *account_name) {
    CFMutableDictionaryRef query = base_query(service_name, account_name);
    if (query == NULL) return 70;
    CFDictionarySetValue(query, kSecReturnAttributes, kCFBooleanTrue);
    CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);
    CFDictionarySetValue(query, kSecUseAuthenticationUI, kSecUseAuthenticationUIFail);
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching(query, &result);
    CFRelease(query);
    if (result != NULL) CFRelease(result);
    if (status == errSecSuccess) return 0;
    if (status == errSecItemNotFound || status == errSecInteractionNotAllowed || status == errSecAuthFailed) return 44;
    fprintf(stderr, "keychain_exists_failed:%d\n", (int)status);
    return 4;
}

static int write_item(const char *service_name, const char *account_name) {
    UInt8 credential[MAX_CREDENTIAL_BYTES + 1];
    size_t length = fread(credential, 1, MAX_CREDENTIAL_BYTES + 1, stdin);
    if (length < 8 || length > MAX_CREDENTIAL_BYTES) return 3;
    CFDataRef data = CFDataCreate(kCFAllocatorDefault, credential, (CFIndex)length);
    if (data == NULL) return 70;
    CFMutableDictionaryRef query = base_query(service_name, account_name);
    if (query == NULL) { CFRelease(data); return 70; }
    const void *update_keys[] = { kSecValueData };
    const void *update_values[] = { data };
    CFDictionaryRef update = CFDictionaryCreate(kCFAllocatorDefault, update_keys, update_values, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    OSStatus status = SecItemUpdate(query, update);
    CFRelease(update);
    if (status == errSecItemNotFound) {
        CFDictionarySetValue(query, kSecValueData, data);
        CFDictionarySetValue(query, kSecAttrAccessible, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly);
        status = SecItemAdd(query, NULL);
    }
    CFRelease(query);
    CFRelease(data);
    volatile UInt8 *wipe = credential;
    for (size_t i = 0; i < sizeof(credential); i++) wipe[i] = 0;
    if (status != errSecSuccess) {
        fprintf(stderr, "keychain_write_failed:%d\n", (int)status);
        return 6;
    }
    return 0;
}

static int delete_item(const char *provider, const char *service_name, const char *account_name) {
    if (strcmp(provider, "test") != 0 && strcmp(provider, "feishu") != 0) return 65;
    CFMutableDictionaryRef query = base_query(service_name, account_name);
    if (query == NULL) return 70;
    OSStatus status = SecItemDelete(query);
    CFRelease(query);
    return status == errSecSuccess || status == errSecItemNotFound ? 0 : 7;
}

int main(int argc, char **argv) {
    if (argc != 3) return 64;
    const char *service_name = service_for_provider(argv[2]);
    const char *account_name = account_for_provider(argv[2]);
    if (service_name == NULL || account_name == NULL) return 65;
    if (strcmp(argv[1], "read") == 0) return read_item(service_name, account_name);
    if (strcmp(argv[1], "exists") == 0) return item_exists(service_name, account_name);
    if (strcmp(argv[1], "write") == 0) return write_item(service_name, account_name);
    if (strcmp(argv[1], "delete") == 0) return delete_item(argv[2], service_name, account_name);
    return 65;
}
