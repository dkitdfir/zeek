
refine connection DCE_RPC_Conn += {
	%member{
		map<uint16, uint16> cont_id_opnum_map;
		uint64 fid;
	%}

	%init{
		fid=0;
	%}

	function set_file_id(fid_in: uint64): bool
		%{
		fid = fid_in;
		return true;
		%}

	function get_cont_id_opnum_map(cont_id: uint16): uint16
		%{
		return cont_id_opnum_map[cont_id];
		%}

	function set_cont_id_opnum_map(cont_id: uint16, opnum: uint16): bool
		%{
		cont_id_opnum_map[cont_id] = opnum;
		return true;
		%}

	function proc_dce_rpc_pdu(pdu: DCE_RPC_PDU): bool
		%{
		// If a whole pdu message parsed ok, let's confirm the protocol
		bro_analyzer()->ProtocolConfirmation();
		return true;
		%}

	function proc_dce_rpc_message(header: DCE_RPC_Header): bool
		%{
		if ( dce_rpc_message )
			{
			BifEvent::generate_dce_rpc_message(bro_analyzer(),
			                                   bro_analyzer()->Conn(),
			                                   ${header.is_orig},
			                                   fid,
			                                   ${header.PTYPE},
			                                   new EnumVal(${header.PTYPE}, BifType::Enum::DCE_RPC::PType));
			}
		return true;
		%}

	function process_dce_rpc_bind(bind: DCE_RPC_Bind): bool
		%{
		if ( dce_rpc_bind )
			{
			// Go over the elements, each having a UUID
			$const_def{bind_elems = bind.context_list};
			for ( int i = 0; i < ${bind_elems.num_contexts}; ++i )
				{
				if ( ${bind_elems.request_contexts[i].abstract_syntax} )
					{
					$const_def{uuid = bind_elems.request_contexts[i].abstract_syntax.uuid};
					$const_def{ver_major = bind_elems.request_contexts[i].abstract_syntax.ver_major};
					$const_def{ver_minor = bind_elems.request_contexts[i].abstract_syntax.ver_minor};

					// Queue the event
					BifEvent::generate_dce_rpc_bind(bro_analyzer(),
					                                bro_analyzer()->Conn(),
					                                fid,
					                                bytestring_to_val(${uuid}),
					                                ${ver_major},
					                                ${ver_minor});
					}
				}
			}

		return true;
		%}

	function process_dce_rpc_bind_ack(bind: DCE_RPC_Bind_Ack): bool
		%{
		if ( dce_rpc_bind_ack )
			{
			StringVal *sec_addr;
			// Remove the null from the end of the string if it's there.
			if ( ${bind.sec_addr}.length() > 0 &&
			     *(${bind.sec_addr}.begin() + ${bind.sec_addr}.length()) == 0 )
				{
				sec_addr = new StringVal(${bind.sec_addr}.length()-1, (const char*) ${bind.sec_addr}.begin());
				}
			else
				{
				sec_addr = new StringVal(${bind.sec_addr}.length(), (const char*) ${bind.sec_addr}.begin());
				}

			BifEvent::generate_dce_rpc_bind_ack(bro_analyzer(),
			                                    bro_analyzer()->Conn(),
			                                    fid,
			                                    sec_addr);
			}
		return true;
		%}

	function process_dce_rpc_request(req: DCE_RPC_Request): bool
		%{
		if ( dce_rpc_request )
			{
			BifEvent::generate_dce_rpc_request(bro_analyzer(),
			                                   bro_analyzer()->Conn(),
			                                   fid,
			                                   ${req.opnum},
			                                   ${req.stub}.length());
			}

		set_cont_id_opnum_map(${req.context_id},
		                      ${req.opnum});
		return true;
		%}

	function process_dce_rpc_response(resp: DCE_RPC_Response): bool
		%{
		if ( dce_rpc_response )
			{
			BifEvent::generate_dce_rpc_response(bro_analyzer(),
			                                    bro_analyzer()->Conn(),
			                                    fid,
			                                    get_cont_id_opnum_map(${resp.context_id}),
			                                    ${resp.stub}.length());
			}

		return true;
		%}

};


refine flow DCE_RPC_Flow += {
	#%member{
	#FlowBuffer frag_reassembler_;
	#%}

	# Fragment reassembly.
	#function reassemble_fragment(frag: bytestring, lastfrag: bool): bool
	#	%{
	#	int orig_data_length = frag_reassembler_.data_length();
	#
	#	frag_reassembler_.NewData(frag.begin(), frag.end());
	#
	#	int new_frame_length = orig_data_length + frag.length();
	#	if ( orig_data_length == 0 )
	#		frag_reassembler_.NewFrame(new_frame_length, false);
	#	else
	#		frag_reassembler_.GrowFrame(new_frame_length);
	#
	#	return lastfrag;
	#	%}

	#function reassembled_body(): const_bytestring
	#	%{
	#	return const_bytestring(
	#		frag_reassembler_.begin(),
	#		frag_reassembler_.end());
	#	%}
};

refine typeattr DCE_RPC_PDU += &let {
	proc = $context.connection.proc_dce_rpc_pdu(this);
}

refine typeattr DCE_RPC_Header += &let {
	proc = $context.connection.proc_dce_rpc_message(this);
};

refine typeattr DCE_RPC_Bind += &let {
	proc = $context.connection.process_dce_rpc_bind(this);
};

refine typeattr DCE_RPC_Bind_Ack += &let {
	proc = $context.connection.process_dce_rpc_bind_ack(this);
};

refine typeattr DCE_RPC_Request += &let {
	proc = $context.connection.process_dce_rpc_request(this);
};

refine typeattr DCE_RPC_Response += &let {
	proc = $context.connection.process_dce_rpc_response(this);
};

