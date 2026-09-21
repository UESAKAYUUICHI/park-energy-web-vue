<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Plus, RefreshCw, Save, Send, Trash2 } from "@lucide/vue";
import AppDialog from "@/components/app/AppDialog.vue";
import {
  catalogLookups,
  createProtocolProfile,
  createProtocolVersion,
  deleteProtocolProfile,
  protocolProfiles,
  protocolVersion,
  publishProtocolVersion,
  saveProtocolVersion,
  validateProtocolVersion,
} from "@/api/platform";
import type { RecordRow } from "@/types/domain";

const rows = ref<RecordRow[]>([]),
  detail = ref<RecordRow>({}),
  selectedId = ref<unknown>(),
  keyword = ref(""),
  busy = ref(false);
const lookups = ref<RecordRow>({});
const validateOpen = ref(false);
const validateResult = ref<RecordRow | null>(null);
const editMode = ref(false);
const detailMode = ref(false);
const createOpen = ref(false),
  createForm = reactive({
    profileCode: "",
    profileName: "",
    manufacturer: "",
    transportType: "MODBUS_RTU",
    versionName: "V1",
    description: "",
  });
const version = computed(() => (detail.value.version as RecordRow) || {}),
  protocolAttributes = computed(() => (detail.value.protocolAttributes as RecordRow[]) || []),
  blocks = computed(() => (detail.value.readBlocks as RecordRow[]) || []),
  fields = computed(() => (detail.value.fields as RecordRow[]) || []),
  commands = computed(() => (detail.value.commands as RecordRow[]) || []);
const editable = computed(() => String(version.value.status) === "DRAFT");
const isEditing = computed(() => editable.value && editMode.value);
const showConfigTables = computed(() => isEditing.value || detailMode.value);
const cyclicBlocks = computed(() => blocks.value.filter((item) => String(item.pollMode || item.poll_mode || "CYCLIC") === "CYCLIC").length);
const validateErrors = computed(() => Array.isArray(validateResult.value?.errors) ? validateResult.value?.errors as string[] : []);
const attributeOptions = computed(() => Array.isArray(lookups.value.attributes) ? lookups.value.attributes as RecordRow[] : []);
const attributeValueOptions = computed(() => Array.isArray(lookups.value.attributeValues) ? lookups.value.attributeValues as RecordRow[] : []);
const pointOptions = computed(() => Array.isArray(lookups.value.standardPoints) ? lookups.value.standardPoints as RecordRow[] : []);
const fieldsByBlock = computed(() => {
  const groups = new Map<string, RecordRow[]>();
  fields.value.forEach((item) => {
    const key = String(item.blockCode || item.block_code || "");
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return groups;
});
function optionsForAttribute(attributeId: unknown) {
  return attributeValueOptions.value.filter((item) => String(item.attribute_id) === String(attributeId));
}
function pointLabel(id: unknown) {
  const point = pointOptions.value.find((row) => String(row.id) === String(id));
  return point ? `${point.point_name} · ${point.point_code}` : "不生成产品测点";
}
function attributeLabel(id: unknown, fallback = "未选择全域属性") {
  const attribute = attributeOptions.value.find((row) => String(row.id) === String(id));
  return attribute ? `${attribute.attribute_name} · ${attribute.attribute_code}` : fallback;
}
function attributeValueLabel(item: RecordRow) {
  const option = optionsForAttribute(item.attributeId || item.attribute_id).find((row) => String(row.id) === String(item.attributeValueOptionId || item.attribute_value_option_id));
  return String(option?.value_text || item.attributeValue || item.attribute_value || "未配置默认值");
}
function displayValue(value: unknown, fallback = "未配置") {
  return value === null || value === undefined || String(value).trim() === "" ? fallback : String(value);
}
function syncAttributeName(item: RecordRow) {
  const attribute = attributeOptions.value.find((row) => String(row.id) === String(item.attributeId));
  if (!attribute) return;
  item.attribute_id = attribute.id;
  item.attribute_code = attribute.attribute_code;
  item.attribute_name = attribute.attribute_name;
  item.group_name = attributeOptions.value.find((row) => String(row.id) === String(item.attributeId))?.group_name || item.group_name;
  item.attributeValueOptionId = "";
  item.attribute_value_option_id = "";
  item.attributeValue = attribute.default_value || "";
  item.attribute_value = attribute.default_value || "";
}
function syncAttributeValue(item: RecordRow) {
  const option = optionsForAttribute(item.attributeId || item.attribute_id).find((row) => String(row.id) === String(item.attributeValueOptionId));
  item.attribute_value_option_id = option?.id || "";
  item.attributeValue = option?.value_text || item.attributeValue || "";
  item.attribute_value = item.attributeValue;
}
function blockKey(block: RecordRow) {
  return String(block.blockCode || block.block_code || "");
}
function fieldsForBlock(block: RecordRow) {
  return fieldsByBlock.value.get(blockKey(block)) || [];
}
function syncFieldPoint(item: RecordRow) {
  const point = pointOptions.value.find((row) => String(row.id) === String(item.standardPointId));
  if (!point) return;
  item.standard_point_id = point.id;
  item.fieldCode = point.point_code;
  item.field_code = point.point_code;
  item.fieldName = point.point_name;
  item.field_name = point.point_name;
  item.rawUnit = point.unit || item.rawUnit || "";
  item.raw_unit = item.rawUnit;
  if (point.data_type && !item.valueType) item.valueType = point.data_type;
}
function normalizeFieldsBeforeSave() {
  fields.value.forEach((item, index) => {
    const point = pointOptions.value.find((row) => String(row.id) === String(item.standardPointId || item.standard_point_id));
    if (point) {
      item.standardPointId = point.id;
      item.standard_point_id = point.id;
      item.fieldCode = point.point_code;
      item.field_code = point.point_code;
      item.fieldName = point.point_name;
      item.field_name = point.point_name;
      if (!item.rawUnit && point.unit) item.rawUnit = point.unit;
      if (!item.raw_unit && point.unit) item.raw_unit = point.unit;
    } else {
      const blockCode = String(item.blockCode || item.block_code || "BLOCK");
      const fallbackCode = String(item.fieldCode || item.field_code || `${blockCode}_FIELD_${index + 1}`);
      item.fieldCode = fallbackCode;
      item.field_code = fallbackCode;
      item.fieldName = String(item.fieldName || item.field_name || `协议字段${index + 1}`);
      item.field_name = item.fieldName;
    }
  });
}
function value(
  row: RecordRow,
  camel: string,
  snake: string,
  fallback: unknown = null,
) {
  return row[camel] ?? row[snake] ?? fallback;
}
function normalizeDetail(source: RecordRow): RecordRow {
  const sourceVersion = (source.version || {}) as RecordRow;
  return {
    version: { ...sourceVersion },
    protocolAttributes: ((source.protocolAttributes || []) as RecordRow[]).map((row) => ({
      ...row,
      attributeId: value(row, "attributeId", "attribute_id", ""),
      attributeValueOptionId: value(row, "attributeValueOptionId", "attribute_value_option_id", ""),
      attributeValue: value(row, "attributeValue", "attribute_value", ""),
      required: Number(value(row, "required", "required", 0)),
    })),
    readBlocks: ((source.readBlocks || []) as RecordRow[]).map((row) => ({
      ...row,
      blockCode: value(row, "blockCode", "block_code", ""),
      blockName: value(row, "blockName", "block_name", ""),
      functionCode: Number(value(row, "functionCode", "function_code", 3)),
      startAddress: Number(value(row, "startAddress", "start_address", 0)),
      registerCount: Number(value(row, "registerCount", "register_count", 1)),
      pollMode: value(row, "pollMode", "poll_mode", "CYCLIC"),
      required: Number(value(row, "required", "required", 1)),
    })),
    fields: ((source.fields || []) as RecordRow[]).map((row) => ({
      ...row,
      fieldCode: value(row, "fieldCode", "field_code", ""),
      fieldName: value(row, "fieldName", "field_name", ""),
      standardPointId: value(row, "standardPointId", "standard_point_id", ""),
      blockCode: value(row, "blockCode", "block_code", ""),
      documentAddress: value(row, "documentAddress", "document_address", ""),
      registerOffset: Number(
        value(row, "registerOffset", "register_offset", 0),
      ),
      registerLength: Number(
        value(row, "registerLength", "register_length", 1),
      ),
      valueType: value(row, "valueType", "value_type", "UINT16"),
      byteOrder: value(row, "byteOrder", "byte_order", "AB"),
      bitOffset: value(row, "bitOffset", "bit_offset", null),
      bitLength: value(row, "bitLength", "bit_length", null),
      decodeFactor: Number(value(row, "decodeFactor", "decode_factor", 1)),
      decodeOffset: Number(value(row, "decodeOffset", "decode_offset", 0)),
      accessMode: value(row, "accessMode", "access_mode", "R"),
      required: Number(value(row, "required", "required", 1)),
    })),
    commands: ((source.commands || []) as RecordRow[]).map((row) => ({
      ...row,
      commandCode: value(row, "commandCode", "command_code", ""),
      commandName: value(row, "commandName", "command_name", ""),
      functionCode: Number(value(row, "functionCode", "function_code", 6)),
      registerAddress: Number(
        value(row, "registerAddress", "register_address", 0),
      ),
      encodeType: value(row, "encodeType", "encode_type", "FIXED"),
      valueType: value(row, "valueType", "value_type", "UINT16"),
      fixedValue: value(row, "fixedValue", "fixed_value", null),
      minimumValue: value(row, "minimumValue", "minimum_value", null),
      maximumValue: value(row, "maximumValue", "maximum_value", null),
      enabled: Number(value(row, "enabled", "enabled", 1)),
    })),
  };
}
async function load() {
  busy.value = true;
  try {
    const [protocolRows, lookupRows] = await Promise.all([protocolProfiles(keyword.value), catalogLookups()]);
    rows.value = protocolRows;
    lookups.value = lookupRows;
    if (!selectedId.value && rows.value[0])
      selectedId.value = rows.value[0].current_version_id;
    if (selectedId.value)
      detail.value = normalizeDetail(await protocolVersion(selectedId.value));
  } finally {
    busy.value = false;
  }
}
async function select(row: RecordRow) {
  editMode.value = false;
  detailMode.value = false;
  selectedId.value = row.current_version_id;
  detail.value = normalizeDetail(await protocolVersion(selectedId.value));
}
async function createNextVersion() {
  if (!confirm("以当前版本为基础创建新草稿？")) return;
  const result = await createProtocolVersion(version.value.profile_id, {
    sourceVersionId: selectedId.value,
  });
  detail.value = normalizeDetail(result);
  selectedId.value = (result.version as RecordRow).id;
  editMode.value = true;
  detailMode.value = false;
  await load();
}
function addBlock() {
  blocks.value.push({
    blockCode: "READ_BLOCK",
    blockName: "采集读块",
    functionCode: 3,
    startAddress: 0,
    registerCount: 1,
    pollMode: "CYCLIC",
    required: 1,
  });
}
function addField(block: RecordRow) {
  const key = blockKey(block);
  const count = fieldsForBlock(block).length + 1;
  fields.value.push({
    fieldCode: `${key || "BLOCK"}_FIELD_${count}`,
    fieldName: `协议字段${count}`,
    blockCode: key,
    documentAddress: "",
    registerOffset: 0,
    registerLength: 1,
    valueType: "UINT16",
    byteOrder: "AB",
    decodeFactor: 1,
    decodeOffset: 0,
    accessMode: "R",
    required: 1,
  });
}
function removeField(item: RecordRow) {
  const index = fields.value.indexOf(item);
  if (index >= 0) fields.value.splice(index, 1);
}
function addProtocolAttribute() {
  protocolAttributes.value.push({
    attributeId: "",
    attributeValueOptionId: "",
    attributeValue: "",
    required: 0,
  });
}
function addCommand() {
  commands.value.push({
    commandCode: "COMMAND",
    commandName: "控制命令",
    functionCode: 6,
    registerAddress: 0,
    encodeType: "FIXED",
    valueType: "UINT16",
    fixedValue: 0,
    enabled: 1,
  });
}
async function save() {
  busy.value = true;
  try {
    normalizeFieldsBeforeSave();
    detail.value = normalizeDetail(
      await saveProtocolVersion(selectedId.value, {
        readBlocks: blocks.value,
        protocolAttributes: protocolAttributes.value,
        fields: fields.value,
        commands: commands.value,
      }),
    );
    editMode.value = false;
    detailMode.value = false;
  } finally {
    busy.value = false;
  }
}
async function runValidate(showDialog = true) {
  const result = await validateProtocolVersion(selectedId.value);
  validateResult.value = result;
  if (showDialog) validateOpen.value = true;
  return result;
}
async function publish() {
  const result = await runValidate(false);
  if (!result.valid) {
    validateOpen.value = true;
    return;
  }
  if (!confirm("发布后该协议版本将不可编辑，确认发布？"))
    return;
  detail.value = await publishProtocolVersion(selectedId.value);
  detailMode.value = false;
  await load();
}
async function create() {
  const result = await createProtocolProfile(createForm);
  createOpen.value = false;
  selectedId.value = (result.version as RecordRow).id;
  await load();
}
async function remove(row: RecordRow) {
  if (!confirm(`删除协议“${row.profile_name}”？仅未被产品引用时允许。`)) return;
  await deleteProtocolProfile(row.id);
  selectedId.value = undefined;
  detail.value = {};
  await load();
}
onMounted(load);
</script>

<template>
  <section class="protocol-page">
    <header>
      <div>
        <h1>协议中心</h1>
        <p>厂家协议版本、Modbus 读块、字段解码与控制白名单</p>
      </div>
      <div class="actions">
        <input
          v-model="keyword"
          placeholder="搜索编码、名称或厂家"
          @keyup.enter="load"
        /><button title="刷新" @click="load"><RefreshCw :size="16" /></button
        ><button class="primary" @click="createOpen = true">
          <Plus :size="16" />新增协议
        </button>
      </div>
    </header>
    <main>
      <aside>
        <div
          v-for="row in rows"
          :key="String(row.id)"
          :class="['protocol-list-row', {
            active: String(row.current_version_id) === String(selectedId),
          }]"
          @click="select(row)"
        >
          <span
            ><b>{{ row.profile_name }}</b
            ><small
              >{{ row.profile_code }} ·
              {{ row.manufacturer || "未填写厂家" }}</small
            ></span
          ><i>{{ row.version_name }} · {{ row.version_status }}</i
          ><em>{{ row.field_count || 0 }} 字段 / {{ row.model_count || 0 }} 产品</em
          ><button class="protocol-delete" type="button" title="删除协议" @click.stop="remove(row)">
            <Trash2 :size="14" />
          </button>
        </div>
        <p v-if="!rows.length">暂无协议档案</p>
      </aside>
      <article v-if="version.id" class="protocol-detail">
        <div class="version-head">
          <div>
            <h2>{{ version.profile_name }}</h2>
            <p>
              {{ version.transport_type }} · {{ version.version_name }} · 厂家 {{ version.manufacturer || "未填写" }}
            </p>
          </div>
          <div class="actions">
            <button v-if="!editable" @click="createNextVersion">
              <Plus :size="15" />修改版本
            </button>
            <button @click="runValidate(true)">校验</button
            ><button v-if="editable && !editMode" @click="editMode = true">编辑</button
            ><button v-if="!isEditing" @click="detailMode = !detailMode">
              {{ detailMode ? "收起详情" : "查看详情" }}
            </button
            ><button v-if="isEditing" @click="save">
              <Save :size="15" />保存</button
            ><button v-if="editable && !editMode" class="primary" @click="publish">
              <Send :size="15" />发布
            </button>
          </div>
        </div>
        <div class="protocol-config-stack">
        <section class="protocol-card">
          <div class="section-head">
            <div><em>01</em><h3>静态属性模板</h3><small>从已有全域属性选择，作为产品目录可套用的静态参数。</small></div>
            <button v-if="isEditing" @click="addProtocolAttribute">
              <Plus :size="14" />新增
            </button>
          </div>
          <table v-if="showConfigTables">
            <thead>
              <tr>
                <th>全域属性</th>
                <th>默认固定值</th>
                <th>是否必填</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in protocolAttributes" :key="String(item.id || i)">
                <td>
                  <select v-model="item.attributeId" :disabled="!isEditing" @change="syncAttributeName(item)">
                    <option value="">请选择已有全域属性</option>
                    <option v-for="attribute in attributeOptions" :key="String(attribute.id)" :value="attribute.id">
                      {{ attribute.attribute_name }} · {{ attribute.attribute_code }}
                    </option>
                  </select>
                </td>
                <td>
                  <select v-if="optionsForAttribute(item.attributeId || item.attribute_id).length" v-model="item.attributeValueOptionId" :disabled="!isEditing" @change="syncAttributeValue(item)">
                    <option value="">请选择固定值</option>
                    <option v-for="option in optionsForAttribute(item.attributeId || item.attribute_id)" :key="String(option.id)" :value="option.id">
                      {{ option.value_text }}
                    </option>
                  </select>
                  <input v-else v-model="item.attributeValue" :disabled="!isEditing" placeholder="默认值，可留空" />
                </td>
                <td>
                  <select v-model.number="item.required" :disabled="!isEditing">
                    <option :value="0">可选</option>
                    <option :value="1">必填</option>
                  </select>
                </td>
                <td>
                  <button
                    title="删除"
                    @click="protocolAttributes.splice(i, 1)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </td>
              </tr>
              <tr v-if="!protocolAttributes.length">
                <td colspan="4" class="empty-cell">暂无静态属性模板。这里从已有全域属性选择，不手动新建属性。</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="tree-list">
            <div v-for="(item, i) in protocolAttributes" :key="String(item.id || i)" class="tree-node leaf">
              <b>{{ attributeLabel(item.attributeId || item.attribute_id) }}</b>
              <small>{{ attributeValueLabel(item) }} · {{ Number(item.required) ? "必填" : "可选" }}</small>
            </div>
            <p v-if="!protocolAttributes.length" class="empty-cell">暂无静态属性模板。</p>
          </div>
        </section>
        <section class="protocol-card primary-card">
          <div class="section-head">
            <div><em>02</em><h3>采集读块与测点映射</h3><small>{{ cyclicBlocks }} 个循环采集块；在读块下面新增子行，默认绑定当前读块。</small></div>
            <button v-if="isEditing" @click="addBlock">
              <Plus :size="14" />新增
            </button>
          </div>
          <div class="read-block-list">
            <article v-for="(block, i) in blocks" :key="String(block.id || i)" class="read-block-card">
              <div v-if="showConfigTables" class="read-block-form">
                <label><span>读块编码</span><input v-model="block.blockCode" :disabled="!isEditing" :placeholder="String(block.block_code || '编码')" /></label>
                <label><span>读块名称</span><input v-model="block.blockName" :disabled="!isEditing" :placeholder="String(block.block_name || '名称')" /></label>
                <label><span>功能码</span><select v-model.number="block.functionCode" :disabled="!isEditing"><option :value="3">03</option><option :value="4">04</option></select></label>
                <label><span>起始地址（0 基）</span><input v-model.number="block.startAddress" type="number" :disabled="!isEditing" :placeholder="String(block.start_address ?? 0)" /></label>
                <label><span>寄存器数</span><input v-model.number="block.registerCount" type="number" :disabled="!isEditing" :placeholder="String(block.register_count ?? 1)" /></label>
                <label><span>采集方式</span><select v-model="block.pollMode" :disabled="!isEditing"><option>CYCLIC</option><option>ON_DEMAND</option></select></label>
                <button title="删除读块" @click="blocks.splice(i, 1)"><Trash2 :size="14" /></button>
              </div>
              <div v-else class="read-block-view tree-node branch">
                <span>
                  <b>{{ displayValue(block.blockName || block.block_name, "未命名读块") }}</b>
                  <small>{{ displayValue(block.blockCode || block.block_code, "未配置编码") }}</small>
                </span>
                <em>FC{{ displayValue(block.functionCode || block.function_code, "03") }}</em>
                <em>起始 {{ displayValue(block.startAddress ?? block.start_address, "0") }}</em>
                <em>{{ displayValue(block.registerCount ?? block.register_count, "1") }} 寄存器</em>
                <em>{{ displayValue(block.pollMode || block.poll_mode, "CYCLIC") }}</em>
              </div>
              <div class="subtable-head">
                <b>测点映射</b><small>{{ fieldsForBlock(block).length }} 项</small>
                <button v-if="isEditing" @click="addField(block)"><Plus :size="14" />新增子行</button>
              </div>
              <table v-if="showConfigTables" class="field-table">
                <thead>
                  <tr>
                    <th>映射终端点位</th>
                    <th>厂家表地址</th>
                    <th>块内偏移 / 长度</th>
                    <th>类型 / 字节序</th>
                    <th>位偏移</th>
                    <th>解码倍率</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="field in fieldsForBlock(block)" :key="String(field.id || field.fieldCode)">
                    <td>
                      <select v-model="field.standardPointId" :disabled="!isEditing" @change="syncFieldPoint(field)">
                        <option value="">不生成产品测点</option>
                        <option v-for="point in pointOptions" :key="String(point.id)" :value="point.id">
                          {{ point.point_name }} · {{ point.point_code }}
                        </option>
                      </select>
                    </td>
                    <td><input v-model="field.documentAddress" :disabled="!isEditing" :placeholder="String(field.document_address || '0x0000')" /></td>
                    <td><div class="pair"><input v-model.number="field.registerOffset" type="number" :disabled="!isEditing" :placeholder="String(field.register_offset ?? 0)" /><input v-model.number="field.registerLength" type="number" :disabled="!isEditing" :placeholder="String(field.register_length ?? 1)" /></div></td>
                    <td><div class="pair"><select v-model="field.valueType" :disabled="!isEditing"><option>UINT16</option><option>INT16</option><option>UINT32</option><option>INT32</option><option>FLOAT32</option><option>BOOLEAN</option></select><select v-model="field.byteOrder" :disabled="!isEditing"><option>AB</option><option>BA</option><option>ABCD</option><option>BADC</option><option>CDAB</option><option>DCBA</option></select></div></td>
                    <td><input v-model.number="field.bitOffset" type="number" :disabled="!isEditing" placeholder="非位域留空" /></td>
                    <td><input v-model.number="field.decodeFactor" type="number" step="0.000001" :disabled="!isEditing" :placeholder="String(field.decode_factor ?? 1)" /></td>
                    <td><button title="删除子行" @click="removeField(field)"><Trash2 :size="14" /></button></td>
                  </tr>
                  <tr v-if="!fieldsForBlock(block).length">
                    <td colspan="7" class="empty-cell">暂无测点映射。点击“新增子行”后选择终端点位并填写厂家地址。</td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="tree-list child-tree">
                <div v-for="field in fieldsForBlock(block)" :key="String(field.id || field.fieldCode)" class="tree-node leaf point-leaf">
                  <b>{{ pointLabel(field.standardPointId || field.standard_point_id) }}</b>
                  <small>
                    {{ displayValue(field.documentAddress || field.document_address, "未填厂家地址") }}
                    · 偏移 {{ displayValue(field.registerOffset ?? field.register_offset, "0") }}
                    · 长度 {{ displayValue(field.registerLength ?? field.register_length, "1") }}
                    · {{ displayValue(field.valueType || field.value_type, "UINT16") }}
                    · 倍率 {{ displayValue(field.decodeFactor ?? field.decode_factor, "1") }}
                  </small>
                </div>
                <p v-if="!fieldsForBlock(block).length" class="empty-cell">暂无测点映射。</p>
              </div>
            </article>
            <p v-if="!blocks.length" class="empty-cell">暂无读块。先新增一个读块，再在读块下面新增测点映射。</p>
          </div>
        </section>
        <section class="protocol-card">
          <div class="section-head">
            <div><em>03</em><h3>控制命令白名单</h3><small>只维护允许下发的 Modbus 写命令，避免网关侧任意写寄存器。</small></div>
            <button v-if="isEditing" @click="addCommand">
              <Plus :size="14" />新增
            </button>
          </div>
          <table v-if="showConfigTables">
            <thead>
              <tr>
                <th>命令编码 / 名称</th>
                <th>功能码</th>
                <th>寄存器地址</th>
                <th>编码</th>
                <th>固定值</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in commands" :key="String(item.id || i)">
                <td>
                  <input
                    v-model="item.commandCode"
                    :disabled="!isEditing"
                    :placeholder="String(item.command_code || '编码')"
                  /><input
                    v-model="item.commandName"
                    :disabled="!isEditing"
                    :placeholder="String(item.command_name || '名称')"
                  />
                </td>
                <td>
                  <select
                    v-model.number="item.functionCode"
                    :disabled="!isEditing"
                  >
                    <option :value="6">06</option>
                  </select>
                </td>
                <td>
                  <input
                    v-model.number="item.registerAddress"
                    type="number"
                    :disabled="!isEditing"
                    :placeholder="String(item.register_address ?? 0)"
                  />
                </td>
                <td>
                  <select v-model="item.encodeType" :disabled="!isEditing">
                    <option>FIXED</option>
                    <option>DIRECT</option>
                    <option>BITMASK_SET</option>
                    <option>BITMASK_CLEAR</option>
                  </select>
                </td>
                <td>
                  <input
                    v-model.number="item.fixedValue"
                    type="number"
                    :disabled="!isEditing"
                    :placeholder="String(item.fixed_value ?? 0)"
                  />
                </td>
                <td>
                  <button
                    title="删除"
                    @click="commands.splice(i, 1)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="tree-list">
            <div v-for="(item, i) in commands" :key="String(item.id || i)" class="tree-node leaf">
              <b>{{ displayValue(item.commandName || item.command_name, "未命名命令") }}</b>
              <small>
                {{ displayValue(item.commandCode || item.command_code, "未配置编码") }}
                · FC{{ displayValue(item.functionCode || item.function_code, "06") }}
                · 地址 {{ displayValue(item.registerAddress ?? item.register_address, "0") }}
                · {{ displayValue(item.encodeType || item.encode_type, "FIXED") }}
                · 固定值 {{ displayValue(item.fixedValue ?? item.fixed_value, "未配置") }}
              </small>
            </div>
            <p v-if="!commands.length" class="empty-cell">暂无控制命令。</p>
          </div>
        </section>
        </div>
      </article>
      <article v-else class="empty">选择左侧协议查看详情</article>
    </main>
    <AppDialog
      v-model:open="createOpen"
      title="新增厂家协议"
      :saving="busy"
      @submit="create"
      ><div class="create-grid">
        <label>协议编码 / 厂家型号<input v-model="createForm.profileCode" placeholder="例如 SMART_LIGHTING_16CH" /></label
        ><label>协议名称<input v-model="createForm.profileName" placeholder="例如 16路智能照明 Modbus 协议" /></label
        ><label>厂家<input v-model="createForm.manufacturer" placeholder="厂家或品牌名称" /></label
        ><label
          >传输类型<select v-model="createForm.transportType">
            <option>MODBUS_RTU</option>
            <option>MODBUS_TCP</option>
          </select></label
        ><label>版本名称<input v-model="createForm.versionName" /></label
        ><label>说明<input v-model="createForm.description" placeholder="来源文件、适用设备或地址说明" /></label></div
    ></AppDialog>
    <AppDialog
      v-model:open="validateOpen"
      title="协议校验结果"
      :show-footer="false"
      dialog-class="protocol-validate-dialog"
    >
      <div class="validate-dialog-body" :class="{ passed: validateResult?.valid }">
        <div class="validate-result-card">
          <span class="validate-result-icon">{{ validateResult?.valid ? "✓" : "!" }}</span>
          <div>
            <strong :class="{ passed: validateResult?.valid }">
              {{ validateResult?.valid ? "校验通过" : "校验未通过" }}
            </strong>
            <p>
              读块 {{ validateResult?.readBlockCount ?? 0 }} 个，协议字段
              {{ validateResult?.fieldCount ?? 0 }} 个。
            </p>
          </div>
        </div>
        <ul v-if="validateErrors.length" class="validate-error-list">
          <li v-for="error in validateErrors" :key="error">{{ error }}</li>
        </ul>
        <p v-else class="validate-success-hint">当前协议结构完整，可以继续发布或同步到产品目录。</p>
      </div>
    </AppDialog>
  </section>
</template>

<style scoped>
.protocol-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #263b53;
}
.protocol-page > header,
.version-head,
.section-head,
.actions {
  display: flex;
  align-items: center;
}
.protocol-page > header {
  min-height: 68px;
  justify-content: space-between;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border);
}
h1,
h2,
h3,
p {
  margin: 0;
}
h1 {
  font-size: 19px;
}
h2 {
  font-size: 16px;
}
h3 {
  font-size: 13px;
}
p,
small {
  color: var(--muted);
  font-size: 10px;
}
.actions {
  gap: 7px;
}
.actions input {
  width: 220px;
}
.protocol-page button {
  min-height: 31px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #ccd8e4;
  border-radius: 5px;
  background: #fff;
  color: #31506d;
}
.protocol-page button.primary {
  border-color: #176fc1;
  background: #176fc1;
  color: #fff;
}
.protocol-page > main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 390px minmax(0, 1fr);
}
aside {
  overflow: auto;
  border-right: 1px solid var(--border);
  padding: 10px;
  background: #fbfdff;
}
.protocol-list-row {
  width: 100%;
  min-height: 76px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  gap: 4px 8px;
  align-items: start;
  padding: 11px 10px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.protocol-list-row.active {
  border-color: #d6e7f8;
  border-left-color: #176fc1;
  background: #eef6ff;
}
.protocol-delete {
  width: 28px;
  height: 28px;
  min-height: 28px;
  grid-column: 2;
  grid-row: 1 / 4;
  flex: none;
  padding: 0;
}
aside span {
  grid-column: 1;
  min-width: 0;
}
aside b {
  display: block;
  color: #263b53;
  font-size: 13px;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}
aside small {
  display: block;
  margin-top: 3px;
  color: #667f97;
  font-size: 10px;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}
aside i {
  grid-column: 1;
  width: fit-content;
  border-radius: 999px;
  padding: 2px 7px;
  background: #eef3f8;
  font-size: 9px;
  font-style: normal;
  color: #71869a;
}
aside em {
  grid-column: 1;
  font-size: 9px;
  font-style: normal;
  color: #8a9bac;
}
article {
  min-width: 0;
  overflow: auto;
}
.protocol-detail {
  background: #f6f9fc;
}
.version-head {
  position: sticky;
  top: 0;
  z-index: 4;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: #fff;
}
.protocol-config-stack {
  display: grid;
  gap: 12px;
  padding: 14px 16px 18px;
}
.protocol-card {
  border: 1px solid #d8e4f0;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(38, 59, 83, 0.04);
  overflow: hidden;
}
.protocol-card.primary-card {
  border-color: #bfd7ef;
}
.section-head {
  justify-content: space-between;
  min-height: 56px;
  padding: 10px 12px;
  border-bottom: 1px solid #e1eaf4;
  background: linear-gradient(180deg, #fbfdff, #f6faff);
}
.section-head > div {
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  row-gap: 2px;
  align-items: baseline;
}
.section-head em {
  grid-row: 1 / 3;
  align-self: center;
  color: #176fc1;
  font-size: 16px;
  font-style: normal;
  font-weight: 800;
}
.section-head h3 {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.section-head small {
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}
th,
td {
  padding: 6px;
  border-bottom: 1px solid #e4ebf1;
  text-align: left;
  font-size: 10px;
}
th {
  height: 30px;
  background: #f5f8fb;
  color: #5e7388;
}
input,
select {
  box-sizing: border-box;
  width: 100%;
  min-height: 31px;
  padding: 4px 6px;
  border: 1px solid #cfdae5;
  border-radius: 4px;
  background: #fff;
  color: #263b53;
  font-size: 10px;
}
td > input + input {
  margin-top: 4px;
}
.pair {
  display: flex;
  gap: 4px;
}
.read-block-list {
  display: grid;
  gap: 12px;
  padding: 12px 14px 14px;
}
.read-block-card {
  border: 1px solid #d5e4f3;
  border-radius: 8px;
  background: #fbfdff;
  box-shadow: 0 8px 18px rgba(38, 59, 83, 0.04);
  overflow: hidden;
}
.read-block-form {
  display: grid;
  grid-template-columns: 1.1fr 1.2fr 90px 130px 100px 110px 34px;
  gap: 8px;
  align-items: end;
  padding: 10px;
  border-bottom: 1px solid var(--border);
  background: #fff;
}
.read-block-form label {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.read-block-form span {
  color: #6c8197;
  font-size: 10px;
}
.read-block-view {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) repeat(4, auto);
  align-items: center;
  gap: 10px;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: linear-gradient(90deg, #f7fbff, #fff);
}
.read-block-view > span {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.read-block-view em {
  border-radius: 999px;
  padding: 3px 7px;
  background: #eaf4ff;
  color: #3d668c;
  font-size: 11px;
  font-style: normal;
  white-space: nowrap;
}
.subtable-head {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #f8fbff;
}
.subtable-head small {
  margin-right: auto;
}
.field-table {
  min-width: 860px;
  background: #fff;
}
.field-table th:first-child,
.field-table td:first-child {
  width: 230px;
}
.tree-list {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 12px 14px 14px;
}
.tree-node {
  position: relative;
  min-height: 40px;
  display: grid;
  gap: 3px;
  padding: 10px 13px 10px 36px;
  border: 1px solid #dde8f3;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 1px 0 rgba(38, 59, 83, 0.02);
}
.tree-node::before {
  content: "";
  position: absolute;
  top: 16px;
  left: 14px;
  width: 8px;
  height: 8px;
  border: 2px solid #66a4df;
  border-radius: 50%;
  background: #fff;
}
.tree-node::after {
  content: "";
  position: absolute;
  top: 20px;
  left: 23px;
  width: 8px;
  border-top: 1px solid #b7d2ec;
}
.tree-node b {
  min-width: 0;
  color: #263b53;
  font-size: 12px;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}
.tree-node small {
  color: #6a8198;
  font-size: 10px;
  line-height: 1.5;
  white-space: normal;
  word-break: break-word;
}
.tree-node.branch {
  border-color: #c9ddf2;
  background: linear-gradient(90deg, #eef7ff, #fff);
  padding-top: 12px;
  padding-bottom: 12px;
}
.tree-node.branch::before {
  border-color: #176fc1;
  background: #176fc1;
}
.tree-node.branch::after {
  border-top-color: #93bee8;
}
.child-tree {
  margin-left: 22px;
  padding: 10px 12px 12px 20px;
  border-left: 2px solid #d6e6f5;
  background: #fbfdff;
}
.point-leaf {
  border-color: #e1e9f1;
  background: linear-gradient(180deg, #fff, #fcfeff);
}
.empty {
  display: grid;
  place-items: center;
  color: var(--muted);
}
.create-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 6px 18px 4px;
}
.create-grid label {
  display: grid;
  gap: 5px;
  font-size: 10px;
}
.protocol-card > table {
  min-width: 720px;
}
.protocol-card > table th:first-child,
.protocol-card > table td:first-child {
  padding-left: 12px;
}
.protocol-card > table th:last-child,
.protocol-card > table td:last-child {
  padding-right: 12px;
}
:deep(.protocol-validate-dialog) {
  width: min(720px, calc(100vw - 42px));
}
:deep(.protocol-validate-dialog .dialog-content) {
  background: #f7f9fc;
}
.validate-dialog-body {
  display: grid;
  gap: 12px;
  padding: 18px 22px 22px;
}
.validate-result-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid #dbe7f5;
  border-radius: 8px;
  background: #fff;
}
.validate-dialog-body.passed .validate-result-card {
  border-color: #c6e5d8;
  background: #f6fbf8;
}
.validate-result-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 8px;
  background: #fff0ec;
  color: #b94f2d;
  font-weight: 700;
  font-size: 18px;
}
.validate-dialog-body.passed .validate-result-icon {
  background: #e9f8f1;
  color: #17643d;
}
.validate-dialog-body strong {
  display: block;
  color: #b94f2d;
  font-size: 18px;
  line-height: 1.35;
}
.validate-dialog-body strong.passed {
  color: #17643d;
}
.validate-dialog-body p {
  margin: 5px 0 0;
  color: #526b84;
  font-size: 13px;
}
.validate-error-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px 14px 12px 30px;
  border: 1px solid #f1c9bf;
  border-radius: 8px;
  background: #fff6f3;
  color: #b94f2d;
  font-size: 12px;
  line-height: 1.7;
}
.validate-success-hint {
  margin: 0 !important;
  padding: 12px 14px;
  border: 1px solid #cae6d7;
  border-radius: 8px;
  background: #f7fcf9;
  color: #3f7c62 !important;
}
@media (max-width: 800px) {
  .protocol-page > main {
    grid-template-columns: 1fr;
    grid-template-rows: 150px minmax(0, 1fr);
  }
  aside {
    display: flex;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  aside button {
    min-width: 210px;
  }
  .protocol-list-row {
    min-width: 210px;
  }
  .protocol-page > header {
    align-items: flex-start;
    flex-direction: column;
  }
  .actions input {
    width: 100%;
  }
  .read-block-form {
    grid-template-columns: 1fr 1fr;
  }
  .read-block-view {
    grid-template-columns: 1fr;
  }
  .tree-node small {
    white-space: normal;
  }
}
</style>
